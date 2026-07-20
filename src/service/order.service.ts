import { Brackets, EntityManager, In, Not, Repository } from "typeorm";
import AppDataSource from "../config/db.config";
import { APIError } from "../utils/ApiError.utils";
import {
    IShippingAddressRequest,
    IUpdateOrderStatusRequest,
    IOrderCreateRequest,
    IAdminOrderQueryParams,
    IPaginatedResult,
} from "../interface/order.interface";
import {
    Order,
    OrderStatus,
    PaymentStatus,
    PaymentMethod,
    DeliveryStatus,
} from "../entities/order.entity";
import { Address } from "../entities/address.entity";
import { OrderItem } from "../entities/orderItems.entity";
import { OrderVendorShipping } from "../entities/orderVendorShipping.entity";
import {
    OrderStatusHistory,
    OrderStatusChangedByRole,
} from "../entities/orderStatusHistory.entity";
import {
    VendorOrderStatus,
    VENDOR_ORDER_STATUS_TRANSITIONS,
} from "../entities/orderVendorShipping.entity";
import { ORDER_STATUS_TRANSITIONS } from "../constants/orderStatus.constants";
import {
    InvalidOrderStatusTransitionError,
    OrderStateChangedError,
} from "../errors/HttpErrors";
import { Cart } from "../entities/cart.entity";
import { CartItem } from "../entities/cartItem.entity";
import { User } from "../entities/user.entity";
import { CartService } from "./cart.service";
import { PaymentService } from "./payment.service";
import { District } from "../entities/district.entity";
import { Product } from "../entities/product.entity";
import { PromoService } from "./promo.service";
import { DiscountType, InventoryStatus } from "../entities/product.enum";
import { Variant } from "../entities/variant.entity";
import { findUserById } from "./user.service";
import { calculatePriceSnapshot } from "../utils/pricing.utils";
import {
    sendCustomerOrderEmail,
    sendOrderStatusEmail,
    sendVendorOrderEmail,
} from "../utils/nodemailer.utils";
import { NotificationService } from "./notification.service";
import crypto from "crypto";
import axios from "axios";
import { PromoType } from "../entities/promo.entity";
import { VendorService } from "./vendor.service";
import { Vendor } from "../entities/vendor.entity";
import config from "../config/env.config";
import {
    sanitizeOrderFull,
    sanitizeOrderForVendor,
    SanitizedOrderFull,
    SanitizedVendorOrderView,
} from "../utils/sanitize.util";
import {
    ShippingCalculationService,
    calculateGrandTotal,
} from "./shipping.service";

/**
 * Service class responsible for managing orders.
 * Handles creation, retrieval, update, and deletion of orders,
 * as well as related entities like addresses, order items, carts, and payments.
 *
 * @module OrderService
 */
export class OrderService {
    private orderRepository: Repository<Order>;
    private addressRepository: Repository<Address>;
    private orderItemRepository: Repository<OrderItem>;
    private orderVendorShippingRepository: Repository<OrderVendorShipping>;
    private orderStatusHistoryRepository: Repository<OrderStatusHistory>;
    private shippingService: ShippingCalculationService;
    private cartRepository: Repository<Cart>;
    private userRepository: Repository<User>;
    private cartService: CartService;
    private paymentService: PaymentService;
    private districtRepository: Repository<District>;
    private productRepository: Repository<Product>;
    private promoService: PromoService;
    private variantRepository: Repository<Variant>;
    private vendorService: VendorService;
    private notificationService: NotificationService;

    /**
     * Initialize repositories and dependent services.
     * Uses AppDataSource to get TypeORM repositories for database operations.
     * Instantiates CartService and PaymentService for related business logic.
     */
    constructor() {
        // Repository to perform CRUD ope
        // rations on Order entities
        this.orderRepository = AppDataSource.getRepository(Order);

        // Repository to manage user addresses related to orders
        this.addressRepository = AppDataSource.getRepository(Address);

        // Repository to handle individual order items in an order
        this.orderItemRepository = AppDataSource.getRepository(OrderItem);

        // Repository for the immutable per-vendor shipping snapshot rows
        this.orderVendorShippingRepository =
            AppDataSource.getRepository(OrderVendorShipping);

        // Append-only order-status audit trail
        this.orderStatusHistoryRepository =
            AppDataSource.getRepository(OrderStatusHistory);

        // Single source of truth for per-vendor shipping-fee calculation
        this.shippingService = new ShippingCalculationService();

        // Repository for accessing cart data linked to users
        this.cartRepository = AppDataSource.getRepository(Cart);

        // Repository to manage user data, useful for order-user relations
        this.userRepository = AppDataSource.getRepository(User);

        // Service instance to perform cart-related logic (e.g., fetching cart items)
        this.cartService = new CartService();

        // Service instance to handle payment processing and related operations
        this.paymentService = new PaymentService();

        // Repository to manage district data, possibly for shipping or address validation
        this.districtRepository = AppDataSource.getRepository(District);

        this.productRepository = AppDataSource.getRepository(Product);

        this.promoService = new PromoService();

        this.variantRepository = AppDataSource.getRepository(Variant);

        this.vendorService = new VendorService();
        this.notificationService = new NotificationService();
    }

    private calculateLineItemPrice(item: any): number {
        if (item?.variant) {
            const variantPrice =
                item.variant.finalPrice ?? item.variant.basePrice;
            const numericVariantPrice = Number(variantPrice);
            return Number.isFinite(numericVariantPrice)
                ? numericVariantPrice
                : 0;
        }

        const basePrice = Number(item?.product?.basePrice ?? 0);
        const discount = Number(item?.product?.discount ?? 0);
        const discountType = item?.product?.discountType;

        if (!Number.isFinite(basePrice)) return 0;
        return calculatePriceSnapshot({
            basePrice,
            discount,
            discountType,
        }).finalPrice;
    }

    private determineInventoryStatus(stock: number): InventoryStatus {
        if (stock <= 0) return InventoryStatus.OUT_OF_STOCK;
        if (stock < 5) return InventoryStatus.LOW_STOCK;
        return InventoryStatus.AVAILABLE;
    }

    private async syncVariantParentProducts(
        variants: Variant[],
        manager?: EntityManager,
    ): Promise<void> {
        const productIds = [
            ...new Set(
                variants
                    .map((variant) => Number(variant.productId))
                    .filter((id) => Number.isFinite(id)),
            ),
        ];

        if (!productIds.length) return;

        const productRepo = manager
            ? manager.getRepository(Product)
            : this.productRepository;

        const products = await productRepo.find({
            where: { id: In(productIds) },
            relations: ["variants"],
        });

        for (const product of products) {
            const totalStock = (product.variants || []).reduce(
                (total, variant) => total + Number(variant.stock || 0),
                0,
            );
            const hasLowVariant = (product.variants || []).some((variant) => {
                const stock = Number(variant.stock || 0);
                return stock > 0 && stock < 5;
            });

            product.stock = totalStock;
            product.status =
                totalStock <= 0
                    ? InventoryStatus.OUT_OF_STOCK
                    : totalStock < 5 || hasLowVariant
                      ? InventoryStatus.LOW_STOCK
                      : InventoryStatus.AVAILABLE;
        }

        await productRepo.save(products);
    }

    /**
     * Fetch a user by their ID, including their address.
     * @param {number} userId - The unique ID of the user to retrieve.
     * @throws {APIError} Throws 404 error if user is not found.
     * @returns {Promise<User>} The user entity including their address relation.
     */
    private async getUser(userId: number): Promise<User> {
        // Attempt to find user by ID with related address data eagerly loaded
        const user = await this.userRepository.findOne({
            where: { id: userId },
            relations: ["address"], // Include associated address in the query result
        });

        // Throw an error if user is not found in the database
        if (!user) throw new APIError(404, "User not found");

        // Return the found user entity
        return user;
    }

    /**
     * Retrieve the cart for a specific user, including nested relations for items and product details.
     * @param {number} userId - The ID of the user whose cart is being fetched.
     * @throws {APIError} Throws 400 error if the cart is empty or not found.
     * @returns {Promise<Cart>} The cart entity with items and related product/vendor/district data.
     */
    private async getCart(userId: number): Promise<Cart> {
        const cart = await this.cartRepository.findOne({
            where: { userId },
            relations: [
                "items",
                "items.product",
                "items.product.vendor",
                "items.product.vendor.district",
                "items.variant",
            ],
        });

        // If cart not found or cart has no items, throw an error indicating cart is empty
        if (!cart || !cart.items.length)
            throw new APIError(400, "Cart is empty");

        // Return the fully populated cart entity
        return cart;
    }

    /**
     * Retrieve a District entity by its name.
     * @param {string} districtName - The name of the district to look up.
     * @throws {APIError} Throws 400 error if the district is not found.
     * @returns {Promise<District>} The matched District entity.
     */
    private async getDistrict(districtName: string): Promise<District> {
        if (!districtName)
            throw new APIError(400, "Customer district is required");

        // Normalized lookup (trim/case/whitespace-insensitive) so the same
        // matching rule used for the shipping-fee comparison also validates
        // the address at checkout time.
        const district =
            await this.shippingService.resolveDistrictByName(districtName);

        // If the district does not exist, throw an error
        if (!district) throw new APIError(400, "Invalid district");

        // Return the found district entity
        return district;
    }

    /**
     * Get an existing address for the user or create a new one based on shipping info.
     *
     * Priority:
     *   1. Use the shipping address from the user's last order (if exists).
     *   2. Use the user's default address if it matches the new shipping details.
     *   3. Otherwise, create and save a new address.
     *
     * @param {number} userId - ID of the user placing the order.
     * @param {IOrderCreateRequest['shippingAddress']} shippingAddress - The shipping address from the order request.
     * @param {any} user - The user object including address data.
     * @returns {Promise<Address>} - The existing or newly created address entity.
     */
    private async getOrCreateAddress(
        userId: number,
        shippingAddress: IShippingAddressRequest,
        user: User,
    ): Promise<Address> {
        let address = await this.addressRepository.findOne({
            where: { userId },
        });

        const resolvedDistrict =
            await this.shippingService.resolveDistrictByName(
                shippingAddress.district,
            );
        const districtId = resolvedDistrict?.id ?? null;

        if (address) {
            if (
                address.province !== shippingAddress.province ||
                address.district !== shippingAddress.district ||
                address.city !== shippingAddress.city ||
                address.localAddress !== shippingAddress.streetAddress ||
                address.landmark !== shippingAddress.landmark ||
                address.districtId !== districtId
            ) {
                address.province = shippingAddress.province;
                address.district = shippingAddress.district;
                address.districtId = districtId;
                address.city = shippingAddress.city;
                address.localAddress = shippingAddress.streetAddress;
                address.landmark = shippingAddress.landmark;
                // address.phoneNumber = phoneNumber; // uncomment if needed

                const savedAddress = await this.addressRepository.save(address);
                user.address = savedAddress;
                await this.userRepository.save(user); // link for eager loading
                return savedAddress;
            }
            return address;
        }

        // Create new address
        const newAddress = this.addressRepository.create({
            province: shippingAddress.province,
            district: shippingAddress.district,
            districtId,
            city: shippingAddress.city,
            localAddress: shippingAddress.streetAddress,
            landmark: shippingAddress.landmark,
            // phoneNumber,
            userId,
        });

        const savedAddress = await this.addressRepository.save(newAddress);
        user.address = savedAddress;
        await this.userRepository.save(user);
        return savedAddress;
    }

    /**
     * Convert cart items into OrderItem entities for persistence.
     *
     * @param {any[]} cartItems - The list of cart items to convert.
     *                            Each item must include a `product` object with `id` and `vendorId`, along with `quantity` and `price`.
     * @returns {OrderItem[]} - Array of OrderItem entities ready to be saved to the database.
     */
    private createOrderItems(items: any[]): OrderItem[] {
        return items.map((item) => {
            const price = this.calculateLineItemPrice(item);
            return this.orderItemRepository.create({
                productId: item.product.id,
                quantity: item.quantity,
                price,
                vendorId: item.product.vendorId,
                variantId: item.variant ? item.variant.id : null,
                productNameSnapshot: item.product.name || null,
                skuSnapshot: item.variant?.sku || null,
                imageSnapshot:
                    item.variant?.variantImages?.[0] ||
                    item.product.productImages?.[0] ||
                    null,
                unitPriceSnapshot: price,
            });
        });
    }

    /**
     * Create a new Order entity from the given cart, user, and order data.
     * This method prepares the entity for saving, but does not persist it to the database.
     *
     * @param {number} userId - The ID of the user placing the order.
     * @param {any} user - The full user object (used for ORM relation).
     * @param {any} cart - The user's cart object including items and total.
     * @param {Address} address - The shipping address to be used for this order.
     * @param {number} shippingFee - The calculated shipping fee for the order.
     * @param {IOrderCreateRequest} orderData - Order creation input, including payment method.
     * @returns {Promise<Order>} - A new Order entity ready to be saved.
     */
    private async createOrderEntity(
        userId: number,
        isBuyNow: boolean,
        user: any,
        items: any[],
        address: Address,
        shippingTotal: number,
        orderData: IOrderCreateRequest,
    ): Promise<Order> {
        // Convert items into OrderItem entities
        const orderItems = this.createOrderItems(items);

        // Calculate subtotal from items
        const merchandiseSubtotal = items.reduce((sum, item) => {
            const linePrice = this.calculateLineItemPrice(item);
            return sum + linePrice * item.quantity;
        }, 0);

        // apply promo code if provided
        const { discountAmount, appliedPromoCode } =
            await this.calculateDiscount(
                userId,
                orderData.promoCode,
                merchandiseSubtotal,
                shippingTotal,
            );

        const taxTotal = 0; // no tax feature exists yet; kept for formula completeness
        const totalPrice = calculateGrandTotal({
            merchandiseSubtotal,
            discountTotal: discountAmount,
            shippingTotal,
            taxTotal,
        });

        const orderNumber = `DJV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

        return this.orderRepository.create({
            orderedById: userId,
            orderedBy: user,
            orderNumber,
            idempotencyKey: orderData.idempotencyKey || null,
            totalPrice,
            shippingFee: shippingTotal,
            merchandiseSubtotal,
            discountTotal: discountAmount,
            taxTotal,
            serviceCharge: orderData.serviceCharge || 0,
            instrumentName: orderData.instrumentName || null,
            paymentStatus: PaymentStatus.UNPAID,
            paymentMethod: orderData.paymentMethod,
            appliedPromoCode,
            status:
                orderData.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
                    ? OrderStatus.CONFIRMED
                    : OrderStatus.PENDING,
            shippingAddress: address,
            shippingAddressSnapshot: {
                province: address.province,
                district: address.district,
                districtId: address.districtId,
                city: address.city,
                localAddress: address.localAddress,
                landmark: address.landmark,
            },
            orderItems,
            deliveryStatus: DeliveryStatus.ORDER_PROCESSING,
            isBuyNow: Boolean(isBuyNow),
            phoneNumber: orderData.phoneNumber,
        });
    }

    /** Single place that applies a promo code — used by both checkout
     * (`createOrderEntity`) and the pre-checkout estimate, so the discount a
     * customer previews always matches what actually gets charged. */
    private async calculateDiscount(
        userId: number,
        promoCode: string | undefined,
        merchandiseSubtotal: number,
        shippingTotal: number,
    ): Promise<{ discountAmount: number; appliedPromoCode: string | null }> {
        if (!promoCode) return { discountAmount: 0, appliedPromoCode: null };

        const promo = await this.promoService.findPromoByCode(promoCode);
        const pastOrderTransaction = await this.orderRepository.find({
            where: {
                appliedPromoCode: promoCode,
                orderedById: userId,
                status: In([OrderStatus.DELIVERED, OrderStatus.CONFIRMED]),
            },
        });

        if (!promo || !promo.isValid || pastOrderTransaction.length > 0) {
            return { discountAmount: 0, appliedPromoCode: null };
        }

        const discountAmount =
            promo.applyOn === PromoType.LINE_TOTAL
                ? (merchandiseSubtotal * promo.discountPercentage) / 100
                : (shippingTotal * promo.discountPercentage) / 100;

        return { discountAmount, appliedPromoCode: promo.promoCode };
    }

    /**
     * Read-only checkout preview: resolves the same vendor/shipping/discount
     * calculation `createOrder` will use, without writing anything to the
     * database. The frontend calls this to render totals instead of
     * recomputing shipping/discount itself — the backend stays the single
     * source of truth even before an order is placed.
     */
    async estimateCheckout(
        userId: number,
        request: Pick<
            IOrderCreateRequest,
            | "shippingAddress"
            | "promoCode"
            | "isBuyNow"
            | "productId"
            | "variantId"
            | "quantity"
        >,
    ) {
        const {
            shippingAddress,
            promoCode,
            isBuyNow,
            productId,
            variantId,
            quantity,
        } = request;

        let items: any[];
        if (isBuyNow) {
            const product = await this.productRepository.findOne({
                where: { id: productId },
                relations: ["variants", "vendor", "vendor.district"],
            });
            if (!product) throw new APIError(404, "Product not found");

            let variant = null;
            if (variantId) {
                variant = await this.variantRepository.findOne({
                    where: { id: variantId },
                });
                if (!variant) throw new APIError(404, "Variant not found");
            }

            items = [{ product, variant, quantity: quantity || 1 }];
        } else {
            const cart = await this.getCart(userId);
            items = cart.items;
        }

        const customerDistrict =
            await this.shippingService.resolveDistrictByName(
                shippingAddress?.district,
            );
        if (!customerDistrict) {
            throw new APIError(400, "Invalid or missing customer district");
        }

        const vendorGroups = [...this.groupItemsByVendor(items).values()];
        const { vendorShippingBreakdown, shippingTotal } =
            this.shippingService.calculateOrderShipping(
                {
                    districtId: customerDistrict.id,
                    districtName: customerDistrict.name,
                },
                vendorGroups.map((g) => ({
                    vendorId: g.vendorId,
                    vendorDistrict: {
                        districtId: g.vendorDistrictId,
                        districtName: g.vendorDistrictName,
                    },
                })),
            );

        const merchandiseSubtotal = vendorGroups.reduce(
            (sum, g) => sum + g.merchandiseSubtotal,
            0,
        );

        const { discountAmount, appliedPromoCode } =
            await this.calculateDiscount(
                userId,
                promoCode,
                merchandiseSubtotal,
                shippingTotal,
            );

        const taxTotal = 0;
        const grandTotal = calculateGrandTotal({
            merchandiseSubtotal,
            discountTotal: discountAmount,
            shippingTotal,
            taxTotal,
        });

        return {
            merchandiseSubtotal,
            vendorShippingBreakdown: vendorShippingBreakdown.map((vs) => {
                const group = vendorGroups.find(
                    (g) => g.vendorId === vs.vendorId,
                )!;
                return {
                    vendorId: vs.vendorId,
                    vendorName: group.vendorName,
                    vendorDistrict: vs.vendorDistrict,
                    customerDistrict: vs.customerDistrict,
                    shippingZone: vs.shippingZone,
                    shippingFee: vs.shippingFee,
                    merchandiseSubtotal: group.merchandiseSubtotal,
                };
            }),
            shippingTotal,
            discountTotal: discountAmount,
            appliedPromoCode,
            taxTotal,
            grandTotal,
        };
    }

    async checkAvailablePromocode(promoCode: string, userId: number) {
        const promo = await this.promoService.findPromoByCode(promoCode);
        if (!promo) {
            return null;
        }
        let pastOrderTransaction = await this.orderRepository.find({
            where: {
                appliedPromoCode: promoCode,
                orderedById: userId,
                status: In([OrderStatus.DELIVERED, OrderStatus.CONFIRMED]),
            },
        });
        if (pastOrderTransaction.length > 0) {
            return null;
        }

        return promo;
    }

    async trackOrder(email: string, orderId: number) {
        const order = await this.orderRepository.findOne({
            where: {
                id: orderId,
                orderedBy: { email },
            },
            relations: ["orderedBy"],
            select: ["id", "status"],
        });

        if (!order) {
            throw new APIError(
                404,
                "Order does not exist or does not belong to the user",
            );
        }

        return order;
    }

    async updateUserDetail(id: number, fullName: string, phoneNumber: string) {
        const userDb = AppDataSource.getRepository(User);

        // Fetch the user first
        const user = await userDb.findOne({ where: { id: id } });
        if (!user) {
            throw new Error("User not found");
        }

        // Update fullName always
        user.fullName = fullName;

        if (phoneNumber && phoneNumber !== user.phoneNumber) {
            user.phoneNumber = phoneNumber;
        }

        // Save changes
        await userDb.save(user);
    }

    async createOrder(
        userId: number,
        orderData: IOrderCreateRequest,
    ): Promise<{
        order: Order;
        redirectUrl?: string;
        vendorids: any[];
        useremail: string;
        esewaRedirectUrl: string | undefined;
    }> {
        try {
            const {
                shippingAddress,
                paymentMethod,
                phoneNumber,
                fullName,
                productId,
                isBuyNow,
                variantId,
                quantity,
                idempotencyKey,
            } = orderData;

            // Idempotency: if key provided, check for existing order
            if (idempotencyKey) {
                const existingOrder = await this.orderRepository.findOne({
                    where: { idempotencyKey },
                    relations: [
                        "orderItems",
                        "orderItems.product",
                        "orderItems.variant",
                        "shippingAddress",
                    ],
                });
                if (existingOrder) {
                    return {
                        order: existingOrder,
                        vendorids: [],
                        useremail: "",
                        esewaRedirectUrl: undefined,
                    };
                }
            }

            await this.updateUserDetail(userId, fullName, phoneNumber);

            // Fetch user and district (always needed)
            const [user, _district] = await Promise.all([
                this.getUser(userId),
                this.getDistrict(shippingAddress.district),
            ]);

            let items: any[];

            if (isBuyNow) {
                // 🔹 Buy Now: create a temporary item list from product/variant
                const product = await this.productRepository.findOne({
                    where: { id: productId },
                    relations: ["variants", "vendor", "vendor.district"],
                });

                if (!product) throw new APIError(404, "Product not found");

                let variant = null;
                if (variantId) {
                    variant = await this.variantRepository.findOne({
                        where: { id: variantId },
                    });
                    if (!variant) throw new APIError(404, "Variant not found");
                }

                items = [
                    {
                        product,
                        variant,
                        quantity,
                    },
                ];
            } else {
                const cart = await this.getCart(userId);
                items = cart.items;
            }

            // Check stock before creating the order
            await this.validateStock(items);

            // Either fetch user's existing address or create a new one based on input
            const address = await this.getOrCreateAddress(
                userId,
                shippingAddress,
                user,
            );

            // Group items by vendor (never by district) and calculate each
            // vendor's shipping fee independently through the single shared
            // ShippingCalculationService.
            const vendorGroups = [...this.groupItemsByVendor(items).values()];
            const { vendorShippingBreakdown, shippingTotal } =
                this.shippingService.calculateOrderShipping(
                    {
                        districtId: address.districtId,
                        districtName: address.district,
                    },
                    vendorGroups.map((g) => ({
                        vendorId: g.vendorId,
                        vendorDistrict: {
                            districtId: g.vendorDistrictId,
                            districtName: g.vendorDistrictName,
                        },
                    })),
                );

            const vendorids = vendorGroups.map((g) => g.vendorId);

            const userDetail = await findUserById(userId);

            const useremail = userDetail.email;

            // Create the Order entity (not yet saved in DB)
            let order = await this.createOrderEntity(
                userId,
                isBuyNow,
                user,
                items,
                address,
                shippingTotal,
                orderData,
            );

            const vendorShippingRows = vendorShippingBreakdown.map((vs) => {
                const group = vendorGroups.find(
                    (g) => g.vendorId === vs.vendorId,
                )!;
                return {
                    vendorId: vs.vendorId,
                    vendorNameSnapshot: group.vendorName,
                    vendorDistrictSnapshot: vs.vendorDistrict,
                    customerDistrictSnapshot: vs.customerDistrict,
                    shippingZone: vs.shippingZone,
                    shippingFee: vs.shippingFee,
                    vendorMerchandiseSubtotal: group.merchandiseSubtotal,
                    vendorTotal: group.merchandiseSubtotal + vs.shippingFee,
                };
            });

            // let redirectUrl: string | undefined;
            let esewaRedirectUrl;
            // Handle different payment methods
            if (paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
                // Row-locked: stock is revalidated and decremented in the
                // same transaction as the order save, so a concurrent
                // checkout for the last unit can't oversell.
                order = await this.reserveStockAndSaveOrder(
                    order,
                    vendorShippingRows,
                );

                // 🔹 Only clear cart if it's not Buy Now
                if (!isBuyNow) {
                    await this.cartService.clearCart(userId);
                }
            } else if (
                paymentMethod === PaymentMethod.ONLINE_PAYMENT ||
                paymentMethod === PaymentMethod.ESEWA ||
                paymentMethod === PaymentMethod.NPX
            ) {
                // Reserve stock + save order atomically, THEN contact the
                // payment gateway — never hold the DB transaction open across
                // an external network call.
                order = await this.reserveStockAndSaveOrder(
                    order,
                    vendorShippingRows,
                );

                if (paymentMethod === PaymentMethod.ESEWA) {
                    esewaRedirectUrl = await this.initateEsewaPayment(order);
                }
            } else {
                throw new APIError(400, "Invalid payment method");
            }

            await this.recordStatusChange(order.id, null, order.status, {
                reason: "Order placed",
                changedByUserId: userId,
                changedByRole: OrderStatusChangedByRole.CUSTOMER,
            });

            return {
                order,
                esewaRedirectUrl,
                vendorids,
                useremail,
            };
        } catch (error) {
            throw error instanceof APIError
                ? error
                : new APIError(500, "Failed to create order");
        }
    }

    async esewaSuccess(token: string, orderId: number) {
        try {
            let object = JSON.parse(
                Buffer.from(token, "base64").toString("ascii"),
            );

            if (object.status !== "COMPLETE") {
                // Release the stock reserved at order creation — otherwise a
                // non-complete eSewa callback leaves it locked up forever.
                await this.esewaFailed(orderId);
                throw new APIError(400, "Payment not completed");
            }

            // order success
            await this.orderSuccess(orderId, object.transaction_uuid);

            // Send emails to customer and vendors
            await this.sendOrderEmails(orderId);

            return { success: true };
        } catch (err) {
            throw new APIError(500, "Esewa payment verification failed");
        }
    }

    // let order = await this.orderRepository.findOne({
    //             where: { id: orderId },
    //             relations: ["orderedBy", "orderItems", "orderItems.product", "orderItems.variant"],
    //         });

    //         if (!order) {
    //             throw new APIError(404, `Order with ID ${orderId} not found`);
    //         }

    //         // cart clear
    //         if (order && !order.isBuyNow) {
    //             await this.cartService.clearCart(order.orderedById)
    //         }

    //         // save order details
    //         await this.orderRepository.save(order);

    //         // send email to customer and vendors
    //         await sendCustomerOrderEmail(
    //             order.orderedBy.email,
    //             order.id,
    //             order.orderItems.map((item) => ({
    //                 name: item?.product?.name,
    //                 sku: item.variant?.sku || null,
    //                 quantity: item.quantity,
    //                 price: item.price,
    //                 variantAttributes: item.variant?.attributes || null,
    //             }))
    //         );

    //         // send vendor email
    //         const vendorIds = [...new Set(order.orderItems.map((item) => item.vendorId))]

    //         for (const vendoId of vendorIds) {
    //             const itemsForVendor = order.orderItems
    //                 .filter((item) => item.vendorId === vendoId)
    //                 .map((item) => ({
    //                     name: item?.product?.name,
    //                     sku: item?.variant?.sku,
    //                     quantity: item.quantity,
    //                     price: item.price,
    //                     variantAttributes: item.variant?.attributes || null
    //                 }))

    //             if (itemsForVendor.length === 0) continue;

    //             const vendor = await this.vendorService.findVendorById(vendoId);

    //             await sendVendorOrderEmail(vendor.email, order.paymentMethod, order.id, itemsForVendor, {
    //                 name: order.orderedBy.fullName,
    //                 phone: order.orderedBy.phoneNumber,
    //                 email: order.orderedBy.email,
    //                 city: order.orderedBy.address.city,
    //                 district: order.orderedBy.address.district,
    //                 localAddress: order.orderedBy.address.localAddress,
    //                 landmark: order.orderedBy.address.landmark
    //             })

    //         }

    async sendOrderEmails(orderId: number) {
        // Fetch the order with all relations
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderedBy",
                "orderedBy.address",
                "orderItems",
                "orderItems.product",
                "orderItems.variant",
            ],
        });

        if (!order) {
            throw new APIError(404, `Order with ID ${orderId} not found`);
        }

        const user = order.orderedBy;

        // Clear cart if not "Buy Now"
        if (!order.isBuyNow) {
            await this.cartService.clearCart(user.id);
        }

        // Extract unique vendor IDs
        const vendorIds = [
            ...new Set(order.orderItems.map((item) => item.vendorId)),
        ];

        // Fetch vendor details including district
        const vendorRepository = AppDataSource.getRepository(Vendor);

        const vendors = await vendorRepository.find({
            where: { id: In(vendorIds) },
            relations: ["district"],
        });

        const customerEmailItems = order.orderItems.map((item) => {
            const vendor = vendors.find((v) => v.id === item.vendorId);
            return {
                name: item.product.name,
                sku: item.variant?.sku || null,
                quantity: item.quantity,
                price: item.price,
                variantAttributes: item.variant?.attributes || null,
                vendorDistrict: vendor?.district?.name || null,
            };
        });

        // Send customer email
        try {
            await sendCustomerOrderEmail(
                user.email,
                order.id,
                order.totalPrice,
                order.shippingFee,
                customerEmailItems,
                user.address.district || null,
            );
        } catch (error) {
            console.error("Failed to send customer order email:", error);
        }

        // Admin copy — full breakdown including shipping, same as the customer email.
        if (config.USER_EMAIL) {
            try {
                await sendCustomerOrderEmail(
                    config.USER_EMAIL,
                    order.id,
                    order.totalPrice,
                    order.shippingFee,
                    customerEmailItems,
                    user.address.district || null,
                    `New Order Placed - #${order.id}`,
                );
            } catch (error) {
                console.error("Failed to send admin order email:", error);
            }
        }

        // Send emails to vendors
        for (const vendorId of vendorIds) {
            const vendor = vendors.find((v) => v.id === vendorId);
            if (!vendor) continue;

            const itemsForVendor = order.orderItems
                .filter((item) => item.vendorId === vendorId)
                .map((item) => ({
                    name: item.product.name,
                    sku: item.variant?.sku || null,
                    quantity: item.quantity,
                    price: item.price,
                    variantAttributes: item.variant?.attributes || null,
                }));

            if (itemsForVendor.length === 0) continue;

            try {
                await sendVendorOrderEmail(
                    vendor.email,
                    order.paymentMethod,
                    order.id,
                    itemsForVendor,
                    {
                        name: user.fullName,
                        phone: user.phoneNumber,
                        email: user.email,
                        city: user.address.city,
                        district: user.address.district,
                        localAddress: user.address.localAddress,
                        landmark: user.address.landmark,
                    },
                );
            } catch (error) {
                console.error(
                    "Failed to send email to vendor, vendor id: ",
                    vendorId,
                    error,
                );
            }
        }
    }

    async esewaFailed(orderId: number) {
        try {
            const order = await this.orderRepository.findOne({
                where: { id: orderId },
                relations: [
                    "orderItems",
                    "orderItems.product",
                    "orderItems.variant",
                ],
            });
            if (!order) {
                throw new APIError(404, "Order not found");
            }

            // Idempotency guard: a duplicate failure callback for an order
            // that's already terminal must not restore stock a second time.
            const alreadyTerminal =
                order.status === OrderStatus.CANCELLED ||
                order.deliveryStatus === DeliveryStatus.DELIVERY_FAILED;

            if (!alreadyTerminal) {
                await this.restoreStock(order.orderItems);
            }

            const previousStatus = order.status;
            // Update order status
            order.status = OrderStatus.CANCELLED;
            order.paymentStatus = PaymentStatus.UNPAID;
            order.deliveryStatus = DeliveryStatus.DELIVERY_FAILED;
            await this.orderRepository.save(order);
            await this.recordStatusChange(
                order.id,
                previousStatus,
                OrderStatus.CANCELLED,
                {
                    reason: "eSewa payment failed",
                },
            );

            if (!alreadyTerminal) {
                await this.notificationService.notifyPaymentFailed(
                    order.id,
                    order.orderedById,
                );
            }
            return { success: true };
        } catch (err) {
            console.error("Esewa payment failure handling failed:", err);
            throw new APIError(500, "Esewa payment verification failed");
        }
    }

    async orderSuccess(orderId: number, transactionId: string) {
        try {
            const order = await this.orderRepository.findOne({
                where: { id: orderId },
            });
            if (!order) {
                throw new APIError(404, "Order not found");
            }

            const previousStatus = order.status;
            // Update order status and transaction ID
            order.status = OrderStatus.CONFIRMED;
            order.paymentStatus = PaymentStatus.PAID;
            order.mTransactionId = transactionId;
            await this.orderRepository.save(order);
            await this.recordStatusChange(
                order.id,
                previousStatus,
                OrderStatus.CONFIRMED,
                {
                    reason: "eSewa payment confirmed",
                },
            );
            await this.notificationService.notifyPaymentSuccess(
                order.id,
                order.orderedById,
            );

            return order;
        } catch (err) {
            console.error("Failed to confirm order:", err);
            throw new APIError(500, "Failed to confirm order");
        }
    }

    private async initateEsewaPayment(order: Order) {
        const transaction_uuid = crypto.randomUUID();

        const data = `total_amount=${order.totalPrice},transaction_uuid=${transaction_uuid},product_code=${config.ESEWA_MERCHANT}`;

        const esewaSignature = this.generateHmacSha256Hash(
            data,
            config.SECRET_KEY,
        );

        let paymentData = {
            amount: order.totalPrice,
            failure_url: `${config.FRONTEND_URL}/order/esewa-payment-failure?oid=${order?.id}`,
            // failure_url: `${config.FRONTEND_URL}/order/esewa-payment-failure&oid=${order?.id}`,
            product_delivery_charge: "0",
            product_service_charge: "0",
            product_code: config.ESEWA_MERCHANT,
            signed_field_names: "total_amount,transaction_uuid,product_code",
            success_url: `${config.FRONTEND_URL}/order/esewa-payment-success?oid=${order?.id}`,
            // success_url: `${config.FRONTEND_URL}/order/esewa-payment-success&oid=${order?.id}`,
            // success_url: `${config.FRONTEND_URL}/order/esewa-payment-success`,
            tax_amount: "0",
            total_amount: order?.totalPrice,
            transaction_uuid: transaction_uuid,
            metadata: {
                paymentId: order?.id,
            },
            signature: esewaSignature,
        };

        try {
            const paymentResponse = await axios.post(
                config.ESEWA_PAYMENT_URL,
                null,
                {
                    params: paymentData,
                },
            );
            const reqPayment = JSON.parse(this.safeStringify(paymentResponse));
            if (
                reqPayment.status === 200 &&
                reqPayment.request?.res?.responseUrl
            ) {
                return {
                    url: reqPayment.request.res.responseUrl,
                };
            } else {
                throw new Error("Esewa payment initiation failed");
            }
        } catch (error) {
            console.error("Esewa payment error:", error);
            throw new APIError(500, "Esewa payment initiation failed");
        }
    }

    private generateHmacSha256Hash(data: string, secret: string) {
        if (!data || !secret) {
            throw new Error(
                "Both data and secret are required to generate a hash.",
            );
        }

        // Create HMAC SHA256 hash and encode it in Base64
        const hash = crypto
            .createHmac("sha256", secret)
            .update(data)
            .digest("base64");

        return hash;
    }

    private safeStringify(obj: any) {
        const cache = new Set();
        const jsonString = JSON.stringify(obj, (key, value) => {
            if (typeof value === "object" && value !== null) {
                if (cache.has(value)) {
                    return; // Discard circular reference
                }
                cache.add(value);
            }
            return value;
        });
        return jsonString;
    }

    // Separate method for stock validation
    private async validateStock(cartItems: CartItem[]): Promise<void> {
        const variantIds = [
            ...new Set(
                cartItems
                    .map((item) =>
                        item.variant ? Number(item.variant.id) : null,
                    )
                    .filter(
                        (id): id is number =>
                            typeof id === "number" && Number.isFinite(id),
                    ),
            ),
        ];

        const productIds = [
            ...new Set(
                cartItems
                    .map((item) =>
                        !item.variant ? Number(item.product?.id) : null,
                    )
                    .filter(
                        (id): id is number =>
                            typeof id === "number" && Number.isFinite(id),
                    ),
            ),
        ];

        const [variants, products] = await Promise.all([
            variantIds.length
                ? this.variantRepository.find({ where: { id: In(variantIds) } })
                : Promise.resolve([]),
            productIds.length
                ? this.productRepository.find({ where: { id: In(productIds) } })
                : Promise.resolve([]),
        ]);

        const variantsById = new Map<number, Variant>(
            variants.map((v) => [v.id, v]),
        );
        const productsById = new Map<number, Product>(
            products.map((p) => [p.id, p]),
        );

        for (const item of cartItems) {
            if (item.variant) {
                const variant = variantsById.get(Number(item.variant.id));

                if (!variant) {
                    throw new APIError(
                        404,
                        `Variant not found for product: ${item.product?.name}`,
                    );
                }

                if (variant.stock < item.quantity) {
                    throw new APIError(400, "Insufficient stock");
                }

                continue;
            }

            const product = productsById.get(Number(item.product?.id));

            if (!product) {
                throw new APIError(
                    404,
                    `Product not found for cart item ID: ${item.id}`,
                );
            }

            if (!product.stock || product.stock < item.quantity) {
                throw new APIError(
                    400,
                    `Insufficient stock for product "${product.name}". ` +
                        `Available: ${product.stock || 0}, Requested: ${item.quantity}`,
                );
            }
        }
    }
    /**
     * Restore (add back) stock for cancelled/failed order items.
     * Runs inside its own row-locked transaction unless an outer transaction
     * manager is supplied, so concurrent restores of the same rows serialize
     * instead of racing.
     */
    private async restoreStock(
        orderItems: any[],
        manager?: EntityManager,
    ): Promise<void> {
        if (!manager) {
            await AppDataSource.transaction((txManager) =>
                this.restoreStock(orderItems, txManager),
            );
            return;
        }

        const variantIds = [
            ...new Set(
                orderItems
                    .map((item: any) =>
                        item.variantId ? Number(item.variantId) : null,
                    )
                    .filter(
                        (id: any): id is number =>
                            typeof id === "number" && Number.isFinite(id),
                    ),
            ),
        ];

        const productIds = [
            ...new Set(
                orderItems
                    .map((item: any) =>
                        item.productId ? Number(item.productId) : null,
                    )
                    .filter(
                        (id: any): id is number =>
                            typeof id === "number" && Number.isFinite(id),
                    ),
            ),
        ];

        const variantRepo = manager.getRepository(Variant);
        const productRepo = manager.getRepository(Product);

        const [variants, products] = await Promise.all([
            variantIds.length
                ? variantRepo
                      .createQueryBuilder("variant")
                      .setLock("pessimistic_write")
                      .where("variant.id IN (:...ids)", { ids: variantIds })
                      .getMany()
                : Promise.resolve([]),
            productIds.length
                ? productRepo
                      .createQueryBuilder("product")
                      .setLock("pessimistic_write")
                      .where("product.id IN (:...ids)", { ids: productIds })
                      .getMany()
                : Promise.resolve([]),
        ]);

        const variantsById = new Map<number, Variant>(
            variants.map((v) => [v.id, v]),
        );
        const productsById = new Map<number, Product>(
            products.map((p) => [p.id, p]),
        );

        const variantsToSave = new Map<number, Variant>();
        const productsToSave = new Map<number, Product>();

        for (const item of orderItems) {
            if (item.variantId) {
                const variant = variantsById.get(Number(item.variantId));
                if (!variant) {
                    throw new APIError(
                        404,
                        `Variant not found for order item ID: ${item.id}`,
                    );
                }

                variant.stock += item.quantity;
                variant.status = this.determineInventoryStatus(variant.stock);

                variantsToSave.set(variant.id, variant);
                continue;
            }

            if (item.productId) {
                const product = productsById.get(Number(item.productId));
                if (!product) {
                    throw new APIError(
                        404,
                        `Product not found for order item ID: ${item.id}`,
                    );
                }

                product.stock += item.quantity;
                product.status = this.determineInventoryStatus(product.stock);

                productsToSave.set(product.id, product);
                continue;
            }

            throw new APIError(
                400,
                `Order item ID: ${item.id} has neither productId nor variantId`,
            );
        }

        if (variantsToSave.size) {
            const savedVariants = await variantRepo.save([
                ...variantsToSave.values(),
            ]);
            await this.syncVariantParentProducts(savedVariants, manager);
        }

        if (productsToSave.size) {
            await productRepo.save([...productsToSave.values()]);
        }
    }

    /**
     * Persist a freshly-created order and decrement its stock atomically.
     * Both the order insert and the stock lock+decrement happen in one
     * transaction: if stock turns out insufficient (a concurrent checkout
     * won the race), the order insert rolls back too, so no PENDING order
     * is left behind with unreserved inventory.
     */
    private async reserveStockAndSaveOrder(
        order: Order,
        vendorShippingRows: Array<{
            vendorId: number;
            vendorNameSnapshot: string;
            vendorDistrictSnapshot: string;
            customerDistrictSnapshot: string;
            shippingZone: string;
            shippingFee: number;
            vendorMerchandiseSubtotal: number;
            vendorTotal: number;
        }> = [],
    ): Promise<Order> {
        return await AppDataSource.transaction(async (manager) => {
            const orderRepo = manager.getRepository(Order);
            const vendorShippingRepo =
                manager.getRepository(OrderVendorShipping);

            let savedOrder = await orderRepo.save(order);

            if (vendorShippingRows.length) {
                await vendorShippingRepo.save(
                    vendorShippingRows.map(
                        (row): Partial<OrderVendorShipping> => ({
                            ...row,
                            shippingZone: row.shippingZone as any,
                            orderId: savedOrder.id,
                        }),
                    ),
                );
            }

            savedOrder = await orderRepo.findOne({
                where: { id: savedOrder.id },
                relations: [
                    "orderItems",
                    "orderItems.product",
                    "orderItems.variant",
                    "vendorShippings",
                ],
            });

            if (!savedOrder) {
                throw new APIError(500, "Failed to create order");
            }

            await this.updateStock(savedOrder.orderItems, manager);

            return savedOrder;
        });
    }

    /**
     * Decrement stock for the given order items.
     *
     * Authoritative and race-safe: when called without an outer transaction
     * manager it opens its own transaction; row locks (`pessimistic_write`)
     * are held on every affected product/variant row for the duration, so
     * concurrent checkouts for the same item serialize instead of both
     * reading stale stock and overselling. `reserveStockAndSaveOrder` passes
     * its own manager so the order row and the stock decrement commit/rollback
     * together atomically.
     */
    private async updateStock(
        orderItems: any[],
        manager?: EntityManager,
    ): Promise<void> {
        if (!manager) {
            await AppDataSource.transaction((txManager) =>
                this.updateStock(orderItems, txManager),
            );
            return;
        }

        const variantIds = [
            ...new Set(
                orderItems
                    .map((item: any) =>
                        item.variantId ? Number(item.variantId) : null,
                    )
                    .filter(
                        (id: any): id is number =>
                            typeof id === "number" && Number.isFinite(id),
                    ),
            ),
        ];

        const productIds = [
            ...new Set(
                orderItems
                    .map((item: any) =>
                        item.productId ? Number(item.productId) : null,
                    )
                    .filter(
                        (id: any): id is number =>
                            typeof id === "number" && Number.isFinite(id),
                    ),
            ),
        ];

        const variantRepo = manager.getRepository(Variant);
        const productRepo = manager.getRepository(Product);

        const [variants, products] = await Promise.all([
            variantIds.length
                ? variantRepo
                      .createQueryBuilder("variant")
                      .setLock("pessimistic_write")
                      .leftJoinAndSelect("variant.product", "product")
                      .where("variant.id IN (:...ids)", { ids: variantIds })
                      .getMany()
                : Promise.resolve([]),
            productIds.length
                ? productRepo
                      .createQueryBuilder("product")
                      .setLock("pessimistic_write")
                      .where("product.id IN (:...ids)", { ids: productIds })
                      .getMany()
                : Promise.resolve([]),
        ]);

        const variantsById = new Map<number, Variant>(
            variants.map((v) => [v.id, v]),
        );
        const productsById = new Map<number, Product>(
            products.map((p) => [p.id, p]),
        );

        const variantsToSave = new Map<number, Variant>();
        const productsToSave = new Map<number, Product>();

        for (const item of orderItems) {
            if (item.variantId) {
                const variant = variantsById.get(Number(item.variantId));

                if (!variant) {
                    throw new APIError(
                        404,
                        `Variant not found for order item ID: ${item.id}`,
                    );
                }

                if (variant.stock < item.quantity) {
                    throw new APIError(
                        400,
                        `Insufficient stock for variant "${variant.sku || variant.id}" of product "${variant.product?.name || "Unknown"}". ` +
                            `Available: ${variant.stock}, Requested: ${item.quantity}`,
                    );
                }

                variant.stock -= item.quantity;
                variant.status = this.determineInventoryStatus(variant.stock);

                variantsToSave.set(variant.id, variant);
                continue;
            }

            if (item.productId) {
                const product = productsById.get(Number(item.productId));

                if (!product) {
                    throw new APIError(
                        404,
                        `Product not found for order item ID: ${item.id}`,
                    );
                }

                if (!product.stock || product.stock < item.quantity) {
                    throw new APIError(
                        400,
                        `Insufficient stock for product "${product.name || product.id}". ` +
                            `Available: ${product.stock || 0}, Requested: ${item.quantity}`,
                    );
                }

                product.stock -= item.quantity;
                product.status = this.determineInventoryStatus(product.stock);

                productsToSave.set(product.id, product);
                continue;
            }

            throw new APIError(
                400,
                `Order item ID: ${item.id} has neither productId nor variantId`,
            );
        }

        if (variantsToSave.size) {
            const savedVariants = await variantRepo.save([
                ...variantsToSave.values(),
            ]);
            await this.syncVariantParentProducts(savedVariants, manager);

            const depletedVariantIds = [...variantsToSave.values()]
                .filter((v) => v.stock <= 0)
                .map((v) => v.id);

            await Promise.allSettled(
                depletedVariantIds.map((id) =>
                    this.removeItemFromCarts(id, true),
                ),
            );
        }

        if (productsToSave.size) {
            await productRepo.save([...productsToSave.values()]);

            const depletedProductIds = [...productsToSave.values()]
                .filter((p) => p.stock <= 0)
                .map((p) => p.id);

            await Promise.allSettled(
                depletedProductIds.map((id) =>
                    this.removeItemFromCarts(id, false),
                ),
            );
        }
    }

    private async removeItemFromCarts(
        itemId: string | number,
        isvariant: boolean,
    ) {
        const cartItemRepo = AppDataSource.getRepository(CartItem);

        if (isvariant) {
            await cartItemRepo.delete({ variantId: Number(itemId) });
        } else {
            await cartItemRepo.delete({ product: { id: Number(itemId) } });
        }
    }

    async verifyPayment(
        orderId: number,
        transactionId: string,
        responseData: any,
    ): Promise<SanitizedOrderFull> {
        // Fetch order by ID and transaction ID, including all required relations
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderedBy",
                "shippingAddress",
                "orderItems",
                "orderItems.product",
                "orderItems.variant",
                "orderItems.vendor",
                "vendorShippings",
            ],
        });

        // If order doesn't exist, throw a 404 error
        if (!order) {
            throw new APIError(404, "Order not found");
        }

        // Verify payment status using external payment service (e.g., Esewa/Khalti)
        const isSuccessful = await this.paymentService.verifyPayment(
            transactionId,
            orderId.toString(),
            responseData,
        );

        const previousStatus = order.status;

        if (isSuccessful) {
            order.paymentStatus = PaymentStatus.PAID;
            order.status = OrderStatus.CONFIRMED;
        } else {
            await this.restoreStock(order.orderItems);
            order.paymentStatus = PaymentStatus.UNPAID;
            order.status = OrderStatus.CANCELLED;
            order.deliveryStatus = DeliveryStatus.DELIVERY_FAILED;
        }

        // Save updated order info
        await this.orderRepository.save(order);
        await this.recordStatusChange(order.id, previousStatus, order.status, {
            reason: isSuccessful
                ? "Payment verified"
                : "Payment verification failed",
        });
        if (isSuccessful) {
            await this.notificationService.notifyPaymentSuccess(
                order.id,
                order.orderedById,
            );
        } else {
            await this.notificationService.notifyPaymentFailed(
                order.id,
                order.orderedById,
            );
        }

        if (isSuccessful) {
            await this.cartService.clearCart(order.orderedById);
        }

        // Return updated order
        return sanitizeOrderFull(order);
    }

    /**
     * Handle payment cancellation scenario by marking the order as UNPAID.
     *
     * @param {number} orderId - ID of the order for which the payment was cancelled.
     * @returns {Promise<void>} - Resolves once the order is updated.
     * @access Public (called when a user cancels payment)
     */
    async handlePaymentCancel(orderId: number): Promise<void> {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderItems",
                "orderItems.product",
                "orderItems.variant",
            ],
        });

        if (!order) {
            throw new APIError(404, "Order not found");
        }

        const shouldRestoreStock =
            order.status !== OrderStatus.CANCELLED &&
            order.deliveryStatus !== DeliveryStatus.DELIVERY_FAILED;

        if (shouldRestoreStock) {
            await this.restoreStock(order.orderItems);
        }

        const previousStatus = order.status;

        // Mark payment as UNPAID
        order.paymentStatus = PaymentStatus.UNPAID;

        // Optionally, update order status to CANCELLED
        order.status = OrderStatus.CANCELLED;
        order.deliveryStatus = DeliveryStatus.DELIVERY_FAILED;

        await this.orderRepository.save(order);
        await this.recordStatusChange(
            order.id,
            previousStatus,
            OrderStatus.CANCELLED,
            {
                reason: "Payment cancelled by customer",
            },
        );
        await this.notificationService.notifyPaymentCancelled(
            order.id,
            order.orderedById,
        );
    }

    /**
     * Group cart/buy-now items by vendor (never by district — two vendors in
     * the same district are still two separate shipments) and compute each
     * vendor's merchandise subtotal plus district reference for shipping.
     */
    private groupItemsByVendor(items: any[]): Map<
        number,
        {
            vendorId: number;
            vendorName: string;
            vendorDistrictId: number | null;
            vendorDistrictName: string;
            merchandiseSubtotal: number;
        }
    > {
        const groups = new Map<
            number,
            {
                vendorId: number;
                vendorName: string;
                vendorDistrictId: number | null;
                vendorDistrictName: string;
                merchandiseSubtotal: number;
            }
        >();

        for (const item of items) {
            const vendor = item.product?.vendor;
            if (!vendor || !vendor.district || !vendor.district.name) {
                throw new APIError(
                    400,
                    `Vendor for product ${item.product?.id} has no valid address`,
                );
            }

            const lineTotal = this.calculateLineItemPrice(item) * item.quantity;
            const existing = groups.get(vendor.id);
            if (existing) {
                existing.merchandiseSubtotal += lineTotal;
                continue;
            }

            groups.set(vendor.id, {
                vendorId: vendor.id,
                vendorName: vendor.businessName || `Vendor #${vendor.id}`,
                vendorDistrictId:
                    vendor.districtId ?? vendor.district.id ?? null,
                vendorDistrictName: vendor.district.name,
                merchandiseSubtotal: lineTotal,
            });
        }

        return groups;
    }

    /** Same grouping as {@link groupItemsByVendor}, but from already-persisted
     * OrderItem rows (used when an existing order's address is edited). */
    private groupOrderItemsByVendor(orderItems: OrderItem[]) {
        const groups = new Map<
            number,
            {
                vendorId: number;
                vendorName: string;
                vendorDistrictId: number | null;
                vendorDistrictName: string;
                merchandiseSubtotal: number;
            }
        >();

        for (const item of orderItems) {
            const vendor = item.vendor;
            if (!vendor || !vendor.district || !vendor.district.name) {
                throw new APIError(
                    400,
                    `Vendor for order item ${item.id} has no valid address`,
                );
            }

            const lineTotal = Number(item.price) * item.quantity;
            const existing = groups.get(vendor.id);
            if (existing) {
                existing.merchandiseSubtotal += lineTotal;
                continue;
            }

            groups.set(vendor.id, {
                vendorId: vendor.id,
                vendorName: vendor.businessName || `Vendor #${vendor.id}`,
                vendorDistrictId:
                    vendor.districtId ?? vendor.district.id ?? null,
                vendorDistrictName: vendor.district.name,
                merchandiseSubtotal: lineTotal,
            });
        }

        return groups;
    }

    /**
     * Fetches all customer orders from the database.
     *
     * @returns {Promise<Order[]>} - A list of all orders with user, items, and shipping address populated.
     * @access Admin
     */
    async getCustomerOrders(): Promise<SanitizedOrderFull[]> {
        const orders = await this.orderRepository.find({
            relations: [
                "orderedBy",
                "orderItems",
                "shippingAddress",
                "orderItems.product",
                "orderItems.variant",
                "vendorShippings",
            ],
            order: { createdAt: "desc" },
        });

        return orders.map((order) => sanitizeOrderFull(order));
    }

    /**
     * Fetch a single order's detailed information by its ID.
     *
     * @param {number} orderId - The ID of the order to retrieve.
     * @returns {Promise<Order>} - The complete order with user, shipping address, products, and vendors included.
     * @throws {APIError} - Throws 404 error if the order is not found.
     * @access Admin | Customer (based on controller-level auth)
     */
    async getCustomerOrderDetails(orderId: number): Promise<Order> {
        const order = await this.orderRepository
            .createQueryBuilder("order")
            .leftJoinAndSelect("order.shippingAddress", "shippingAddress")
            .leftJoinAndSelect("order.orderItems", "orderItems")
            .leftJoinAndSelect("orderItems.product", "product")
            .leftJoinAndSelect("orderItems.vendor", "vendor")
            .leftJoinAndSelect("vendor.district", "district")
            .leftJoinAndSelect("orderItems.variant", "variant")
            .leftJoinAndSelect("order.vendorShippings", "vendorShippings")
            // select only safe customer fields (exclude password, tokens, verification codes, etc.)
            .leftJoin("order.orderedBy", "orderedBy")
            .addSelect([
                "orderedBy.id",
                "orderedBy.fullName",
                "orderedBy.username",
                "orderedBy.email",
                "orderedBy.phoneNumber",
                "orderedBy.role",
                "orderedBy.provider",
                "orderedBy.isVerified",
                "orderedBy.createdAt",
                "orderedBy.updatedAt",
            ])
            .leftJoinAndSelect("orderedBy.address", "address")
            .where("order.id = :orderId", { orderId })
            .getOne();

        // Handle case when order does not exist
        if (!order) {
            throw new APIError(404, "Order not found");
        }

        return order;
    }

    async getOrderById(orderId: number): Promise<Order> {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderedBy",
                "shippingAddress",
                "orderItems",
                "orderItems.product",
                "orderItems.vendor",
            ],
            select: {
                id: true,
                totalPrice: true,
                shippingFee: true,
                status: true,
                paymentStatus: true,
                paymentMethod: true,
                createdAt: true,

                orderedBy: {
                    id: true,
                    fullName: true,
                    email: true,
                    phoneNumber: true,
                },

                shippingAddress: {
                    id: true,
                    province: true,
                    district: true,
                    city: true,
                    localAddress: true,
                    landmark: true,
                },

                orderItems: {
                    id: true,
                    quantity: true,
                    price: true,

                    product: {
                        id: true,
                        name: true,
                        productImages: true,
                    },

                    vendor: {
                        id: true,
                        businessName: true,
                    },

                    variant: {
                        id: true,
                        sku: true,
                        basePrice: true,
                        finalPrice: true,
                        discount: true,
                        discountType: true,
                        attributes: true,
                        variantImages: true,
                        stock: true,
                        status: true,
                    },
                },
            },
        });
        // Handle case when order does not exist
        if (!order) {
            throw new APIError(404, "Order not found");
        }

        return order;
    }

    /**
     * Update the shipping address for a specific pending order by the user.
     *
     * @param {number} userId - ID of the user who owns the order.
     * @param {number} orderId - ID of the order to update.
     * @param {IShippingAddressRequest} addressData - New shipping address data.
     * @returns {Promise<Order>} - The updated order with full relations loaded.
     * @throws {APIError} - Throws 404 if order not found or 500 if updated order retrieval fails.
     * @access Customer (only owner of pending order can update)
     */
    async updateShippingAddress(
        userId: number,
        orderId: number,
        addressData: IShippingAddressRequest,
    ): Promise<any> {
        // Find the pending order by orderId and userId
        const order = await this.orderRepository.findOne({
            where: {
                id: orderId,
                orderedById: userId,
                status: OrderStatus.CONFIRMED,
                paymentStatus: PaymentStatus.UNPAID,
            },
            relations: ["orderedBy", "orderItems", "orderItems.vendor"],
        });

        // If order not found or status not PENDING, throw 404
        if (!order) {
            throw new APIError(404, "Order not found");
        }

        // Find existing address associated with the user (if any)
        let shippingAddress = await this.addressRepository.findOne({
            where: { userId },
        });

        const resolvedDistrict =
            await this.shippingService.resolveDistrictByName(
                addressData.district,
            );
        const districtId = resolvedDistrict?.id ?? null;
        const addressPayload = {
            province: addressData.province,
            district: addressData.district,
            districtId,
            city: addressData.city,
            localAddress: addressData.streetAddress,
            landmark: addressData.landmark,
        };

        if (shippingAddress) {
            // Merge new address data into existing address entity
            this.addressRepository.merge(shippingAddress, addressPayload);

            // Save updated address to DB
            shippingAddress =
                await this.addressRepository.save(shippingAddress);
        } else {
            // No existing address: create a new one with userId attached
            shippingAddress = this.addressRepository.create({
                ...addressPayload,
                userId,
            });

            // Save new address entity to DB
            shippingAddress =
                await this.addressRepository.save(shippingAddress);
        }

        // Recalculate this order's shipping against the new address — an
        // address change must never leave the order's old shipping numbers in
        // place (per-vendor fees, shipping total, and grand total all shift).
        const vendorGroups = [
            ...this.groupOrderItemsByVendor(order.orderItems).values(),
        ];
        const { vendorShippingBreakdown, shippingTotal } =
            this.shippingService.calculateOrderShipping(
                {
                    districtId: shippingAddress.districtId,
                    districtName: shippingAddress.district,
                },
                vendorGroups.map((g) => ({
                    vendorId: g.vendorId,
                    vendorDistrict: {
                        districtId: g.vendorDistrictId,
                        districtName: g.vendorDistrictName,
                    },
                })),
            );

        // Update order's shipping address reference with new or updated address
        order.shippingAddress = shippingAddress;
        order.shippingAddressSnapshot = {
            province: shippingAddress.province,
            district: shippingAddress.district,
            districtId: shippingAddress.districtId,
            city: shippingAddress.city,
            localAddress: shippingAddress.localAddress,
            landmark: shippingAddress.landmark,
        };
        order.shippingFee = shippingTotal;
        order.totalPrice = calculateGrandTotal({
            merchandiseSubtotal: Number(order.merchandiseSubtotal),
            discountTotal: Number(order.discountTotal),
            shippingTotal,
            taxTotal: Number(order.taxTotal),
        });

        // Persist changes to the order
        await this.orderRepository.save(order);

        // Replace this order's per-vendor shipping snapshot with the freshly
        // calculated one — the old rows described a delivery that no longer
        // applies.
        await this.orderVendorShippingRepository.delete({ orderId: order.id });
        await this.orderVendorShippingRepository.save(
            vendorShippingBreakdown.map((vs) => {
                const group = vendorGroups.find(
                    (g) => g.vendorId === vs.vendorId,
                )!;
                return this.orderVendorShippingRepository.create({
                    orderId: order.id,
                    vendorId: vs.vendorId,
                    vendorNameSnapshot: group.vendorName,
                    vendorDistrictSnapshot: vs.vendorDistrict,
                    customerDistrictSnapshot: vs.customerDistrict,
                    shippingZone: vs.shippingZone as any,
                    shippingFee: vs.shippingFee,
                    vendorMerchandiseSubtotal: group.merchandiseSubtotal,
                    vendorTotal: group.merchandiseSubtotal + vs.shippingFee,
                });
            }),
        );

        // Retrieve and return the updated order with all necessary relations
        const updatedOrder = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderedBy",
                "shippingAddress",
                "orderItems",
                "orderItems.product",
                "orderItems.vendor",
                "vendorShippings",
            ],
        });

        // Defensive check to ensure updated order was retrieved
        if (!updatedOrder) {
            throw new APIError(500, "Failed to retrieve updated order");
        }

        return sanitizeOrderFull(updatedOrder) as any;
    }

    /**
     * Retrieve all orders with server-side pagination, search, filtering, and
     * sorting — never load every order and paginate/filter in the frontend.
     *
     * @access Admin or authorized roles
     */
    async getAllOrders(
        params: IAdminOrderQueryParams = {},
    ): Promise<IPaginatedResult<SanitizedOrderFull>> {
        const page = Math.max(1, Number(params.page) || 1);
        // Safe upper bound: never let a client request an unbounded page size.
        const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));

        // Step 1: resolve the page of order IDs only. Paginating directly on a
        // query that joins the one-to-many orderItems would skip/take across
        // joined *rows*, not orders, and silently corrupt pagination — so this
        // ID query joins only what search/filtering needs, then a second query
        // loads full relations for exactly those IDs.
        const idQuery = this.orderRepository
            .createQueryBuilder("order")
            .leftJoin("order.orderedBy", "orderedBy")
            .leftJoin("order.orderItems", "orderItems")
            .leftJoin("orderItems.vendor", "vendor")
            .select("order.id", "id");

        if (params.search?.trim()) {
            const search = `%${params.search.trim()}%`;
            idQuery.andWhere(
                new Brackets((qb) => {
                    qb.where("CAST(order.id AS TEXT) ILIKE :search")
                        .orWhere("order.orderNumber ILIKE :search")
                        .orWhere("order.transactionId ILIKE :search")
                        .orWhere("order.mTransactionId ILIKE :search")
                        .orWhere("CAST(order.status AS TEXT) ILIKE :search")
                        .orWhere(
                            "CAST(order.paymentStatus AS TEXT) ILIKE :search",
                        )
                        .orWhere(
                            "CAST(order.paymentMethod AS TEXT) ILIKE :search",
                        )
                        .orWhere("orderedBy.fullName ILIKE :search")
                        .orWhere("orderedBy.username ILIKE :search")
                        .orWhere("orderedBy.email ILIKE :search")
                        .orWhere("orderedBy.phoneNumber ILIKE :search")
                        .orWhere("vendor.businessName ILIKE :search");
                }),
                { search },
            );
        }

        if (params.status) {
            idQuery.andWhere("order.status = :status", {
                status: params.status,
            });
        }

        if (params.paymentStatus) {
            idQuery.andWhere("order.paymentStatus = :paymentStatus", {
                paymentStatus: params.paymentStatus,
            });
        }

        if (params.vendorId) {
            idQuery.andWhere("orderItems.vendorId = :vendorId", {
                vendorId: params.vendorId,
            });
        }

        if (params.startDate && params.endDate) {
            idQuery.andWhere(
                "order.createdAt BETWEEN :startDate AND :endDate",
                {
                    startDate: params.startDate,
                    endDate: params.endDate,
                },
            );
        }

        if (params.minPrice != null) {
            idQuery.andWhere("order.totalPrice >= :minPrice", {
                minPrice: params.minPrice,
            });
        }
        if (params.maxPrice != null) {
            idQuery.andWhere("order.totalPrice <= :maxPrice", {
                maxPrice: params.maxPrice,
            });
        }

        let sortColumn = "order.createdAt";
        let sortDirection: "ASC" | "DESC" = "DESC";
        switch (params.sort) {
            case "oldest":
                sortColumn = "order.createdAt";
                sortDirection = "ASC";
                break;
            case "highest_total":
                sortColumn = "order.totalPrice";
                sortDirection = "DESC";
                break;
            case "lowest_total":
                sortColumn = "order.totalPrice";
                sortDirection = "ASC";
                break;
            case "recently_updated":
                sortColumn = "order.updatedAt";
                sortDirection = "DESC";
                break;
            case "order_number":
                sortColumn = "order.orderNumber";
                sortDirection = "ASC";
                break;
            case "newest":
            default:
                sortColumn = "order.createdAt";
                sortDirection = "DESC";
                break;
        }

        const totalItems = await idQuery.getCount();
        const totalPages = Math.max(1, Math.ceil(totalItems / limit));

        const idRows = await idQuery
            .distinct(true)
            .addSelect(sortColumn, "sortValue")
            .orderBy(sortColumn, sortDirection)
            .addOrderBy("order.id", sortDirection)
            .offset((page - 1) * limit)
            .limit(limit)
            .getRawMany<{ id: number }>();
        const orderIds = idRows.map((r) => r.id);

        if (orderIds.length === 0) {
            return {
                items: [],
                pagination: {
                    page,
                    limit,
                    totalItems,
                    totalPages,
                    hasNextPage: false,
                    hasPreviousPage: page > 1,
                },
            };
        }

        // Step 2: load full relations for just this page's orders.
        const orders = await this.orderRepository
            .createQueryBuilder("order")
            .leftJoinAndSelect("order.orderedBy", "orderedBy")
            .leftJoinAndSelect("order.shippingAddress", "shippingAddress")
            .leftJoinAndSelect("order.orderItems", "orderItems")
            .leftJoinAndSelect("orderItems.product", "product")
            .leftJoinAndSelect("orderItems.vendor", "vendor")
            .leftJoinAndSelect("orderItems.variant", "variant")
            .leftJoinAndSelect("order.vendorShippings", "vendorShippings")
            .where("order.id IN (:...orderIds)", { orderIds })
            .getMany();

        // Preserve the page's sort order — `IN (...)` does not guarantee it.
        const ordersById = new Map(orders.map((o) => [o.id, o]));
        const sortedOrders = orderIds
            .map((id) => ordersById.get(id))
            .filter((o): o is Order => !!o);

        return {
            items: sortedOrders.map(sanitizeOrderFull),
            pagination: {
                page,
                limit,
                totalItems,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1,
            },
        };
    }

    /**
     * Retrieve detailed information of a single order by its ID.
     *
     * @param {number} orderId - The ID of the order to fetch.
     * @returns {Promise<Order>} - The order with related user, shipping address, items, products, and vendors.
     * @throws {APIError} - Throws 404 error if the order is not found.
     * @access Admin or authorized roles
     */
    async getOrderDetails(orderId: number): Promise<SanitizedOrderFull> {
        // Find the order by ID with all related entities loaded
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderedBy",
                "shippingAddress",
                "orderItems",
                "orderItems.product",
                "orderItems.vendor",
                "orderItems.variant",
                "vendorShippings",
            ],
        });

        // Throw error if no order is found
        if (!order) {
            throw new APIError(404, "Order not found");
        }

        // Return the found order with relations
        return sanitizeOrderFull(order);
    }

    /**
     * Update the status of an existing order by ID.
     *
     * @param {number} orderId - The ID of the order to update.
     * @param {OrderStatus} status - The new status to set for the order.
     * @returns {Promise<Order>} - The updated order entity.
     * @throws {APIError} - Throws 404 if order not found, 400 if invalid status provided.
     * @access Admin or authorized users
     */
    async updateOrderStatus(
        orderId: number,
        status: IUpdateOrderStatusRequest["status"],
        options: {
            expectedCurrentStatus?: OrderStatus;
            reason?: string;
            note?: string;
            changedByUserId?: number;
            changedByRole?: OrderStatusChangedByRole;
        } = {},
    ): Promise<SanitizedOrderFull> {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderedBy",
                "shippingAddress",
                "orderItems",
                "orderItems.product",
                "orderItems.vendor",
                "vendorShippings",
            ],
        });

        if (!order) {
            throw new APIError(404, "Order not found");
        }

        // Optimistic-concurrency guard: reject if the order moved since the
        // caller last read it (another admin, a vendor, or a payment webhook).
        if (
            options.expectedCurrentStatus &&
            options.expectedCurrentStatus !== order.status
        ) {
            throw new OrderStateChangedError(
                `Order is currently ${order.status}, not ${options.expectedCurrentStatus}. Refresh and try again.`,
            );
        }

        const previousStatus = order.status;

        if (status === OrderStatus.CANCELLED) {
            for (const item of order.orderItems) {
                if (item.variantId) {
                    const variant = await this.variantRepository.findOne({
                        where: { id: item.variantId },
                    });
                    if (variant) {
                        variant.stock += item.quantity;
                        await this.variantRepository.save(variant);
                    }
                } else {
                    const product = await this.productRepository.findOne({
                        where: { id: item.productId },
                    });
                    if (product) {
                        product.stock += item.quantity;
                        await this.productRepository.save(product);
                    }
                }
            }
        }

        // Handle COD payment update on delivery
        if (
            status === OrderStatus.DELIVERED &&
            order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY &&
            order.paymentStatus !== PaymentStatus.PAID
        ) {
            order.paymentStatus = PaymentStatus.PAID;
        }

        if (status === OrderStatus.CANCELLED) {
            for (const item of order.orderItems) {
                if (item.variantId) {
                    const variant = await this.variantRepository.findOne({
                        where: { id: item.variantId },
                    });
                    if (variant) {
                        variant.stock += item.quantity;
                        variant.status = this.determineInventoryStatus(
                            variant.stock,
                        );
                        await this.variantRepository.save(variant);
                    }
                } else {
                    const product = await this.productRepository.findOne({
                        where: { id: item.productId },
                    });
                    if (product) {
                        product.stock += item.quantity;
                        product.status = this.determineInventoryStatus(
                            product.stock,
                        );
                        await this.productRepository.save(product);
                    }
                }
            }
        }

        order.status = status;

        if (status === OrderStatus.CANCELLED) {
            for (const item of order.orderItems) {
                if (item.variantId) {
                    const variant = await this.variantRepository.findOne({
                        where: { id: item.variantId },
                    });
                    if (variant) {
                        variant.stock += item.quantity;
                        await this.variantRepository.save(variant);
                    }
                } else {
                    const product = await this.productRepository.findOne({
                        where: { id: item.productId },
                    });
                    if (product) {
                        product.stock += item.quantity;
                        await this.productRepository.save(product);
                    }
                }
            }
        }

        // Handle COD payment update on delivery
        if (
            status === OrderStatus.DELIVERED &&
            order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY &&
            order.paymentStatus !== PaymentStatus.PAID
        ) {
            order.paymentStatus = PaymentStatus.PAID;
        }

        await this.orderRepository.save(order);
        await this.recordStatusChange(
            order.id,
            previousStatus,
            status,
            options,
        );

        if (order.orderedBy?.email) {
            await sendOrderStatusEmail(
                order.orderedBy.email,
                order.id,
                order.status,
            );
        }

        return sanitizeOrderFull(order);
    }

    /** Appends one row to the order-status audit trail; no-ops when the
     * status didn't actually change. Every code path that mutates
     * Order.status (manual update, payment webhook, cancellation) must call
     * this instead of writing order_status_histories directly. */
    private async recordStatusChange(
        orderId: number,
        previousStatus: OrderStatus | null,
        newStatus: OrderStatus,
        options: {
            reason?: string;
            note?: string;
            changedByUserId?: number;
            changedByRole?: OrderStatusChangedByRole;
        } = {},
    ): Promise<void> {
        if (previousStatus === newStatus) return;

        await this.orderStatusHistoryRepository.save(
            this.orderStatusHistoryRepository.create({
                orderId,
                previousStatus,
                newStatus,
                changedByUserId: options.changedByUserId ?? null,
                changedByRole:
                    options.changedByRole ?? OrderStatusChangedByRole.SYSTEM,
                reason: options.reason ?? null,
                note: options.note ?? null,
            }),
        );
    }

    /**
     * Chronological status timeline for one order, for the order-details
     * "status history" panel.
     */
    async getOrderStatusHistory(
        orderId: number,
    ): Promise<OrderStatusHistory[]> {
        return this.orderStatusHistoryRepository.find({
            where: { orderId },
            relations: ["changedBy"],
            order: { createdAt: "ASC" },
        });
    }

    /**
     * Vendor-scoped fulfillment status update — moves only this vendor's own
     * OrderVendorShipping.status, never the parent Order.status. A vendor
     * cannot mark an order DELIVERED (courier/admin-only) or touch another
     * vendor's row.
     */
    async updateVendorOrderStatus(
        vendorId: number,
        orderId: number,
        status: VendorOrderStatus,
        options: { reason?: string; note?: string } = {},
    ): Promise<SanitizedVendorOrderView> {
        const vendorShipping = await this.orderVendorShippingRepository.findOne(
            {
                where: { orderId, vendorId },
            },
        );

        if (!vendorShipping) {
            throw new APIError(
                404,
                "Order not found or you are not authorized to view it",
            );
        }

        if (status === VendorOrderStatus.DELIVERED) {
            throw new InvalidOrderStatusTransitionError(
                "Vendors cannot mark an order delivered — this requires courier or admin confirmation.",
            );
        }

        const previousStatus = vendorShipping.status;
        if (
            previousStatus !== status &&
            !VENDOR_ORDER_STATUS_TRANSITIONS[previousStatus].includes(status)
        ) {
            throw new InvalidOrderStatusTransitionError(
                `This vendor's order cannot move from ${previousStatus} to ${status}.`,
            );
        }

        vendorShipping.status = status;
        await this.orderVendorShippingRepository.save(vendorShipping);

        if (previousStatus !== status) {
            await this.orderStatusHistoryRepository.save(
                this.orderStatusHistoryRepository.create({
                    orderId,
                    vendorOrderId: vendorShipping.id,
                    previousStatus: previousStatus as unknown as OrderStatus,
                    newStatus: status as unknown as OrderStatus,
                    changedByRole: OrderStatusChangedByRole.VENDOR,
                    reason: options.reason ?? null,
                    note: options.note ?? null,
                }),
            );
        }

        const order = await this.orderRepository
            .createQueryBuilder("order")
            .leftJoinAndSelect("order.orderItems", "orderItems")
            .leftJoinAndSelect("order.orderedBy", "orderedBy")
            .leftJoinAndSelect("order.shippingAddress", "shippingAddress")
            .leftJoinAndSelect("orderItems.product", "product")
            .leftJoinAndSelect("orderItems.vendor", "vendor")
            .leftJoinAndSelect("orderItems.variant", "variant")
            .leftJoinAndSelect("order.vendorShippings", "vendorShippings")
            .where("order.id = :orderId", { orderId })
            .andWhere("orderItems.vendorId = :vendorId", { vendorId })
            .getOne();

        if (!order) {
            throw new APIError(404, "Order not found");
        }

        return sanitizeOrderForVendor(order, vendorId);
    }

    /**
     * Search for an order by its ID, including related entities.
     *
     * @param {number} orderId - The ID of the order to search for.
     * @returns {Promise<Order | null>} - The order if found, otherwise null.
     * @access Admin or authorized users
     */
    async searchOrdersById(
        orderId: number,
    ): Promise<SanitizedOrderFull | null> {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderedBy",
                "shippingAddress",
                "orderItems",
                "orderItems.product",
                "orderItems.vendor",
                "vendorShippings",
            ],
        });
        return order ? sanitizeOrderFull(order) : null;
    }

    /**
     * Get all orders that include products sold by a specific vendor.
     *
     * @param {number} vendorId - The ID of the vendor to filter orders by.
     * @returns {Promise<Order[]>} - List of orders containing vendor's products.
     * @access Vendor or Admin
     */
    async getVendorOrders(
        vendorId: number,
    ): Promise<SanitizedVendorOrderView[]> {
        // Use QueryBuilder to join related tables and filter orders by vendorId in orderItems.
        // The WHERE on the joined orderItems alias scopes the hydrated orderItems
        // array to just this vendor's rows already — but top-level order fields
        // (totalPrice, shippingFee, merchandiseSubtotal) still belong to the
        // whole multi-vendor order, so the response must go through
        // sanitizeOrderForVendor rather than being spread as-is.
        const orders = await this.orderRepository
            .createQueryBuilder("order")
            .leftJoinAndSelect("order.orderItems", "orderItems") // Include order items
            .leftJoinAndSelect("order.orderedBy", "orderedBy") // Include user who placed order
            .leftJoinAndSelect("order.shippingAddress", "shippingAddress") // Include shipping address
            .leftJoinAndSelect("orderItems.product", "product") // Include products in order items
            .leftJoinAndSelect("orderItems.vendor", "vendor") // Include vendor info for order items
            .leftJoinAndSelect("vendor.district", "district")
            .leftJoinAndSelect("orderItems.variant", "variant")
            .leftJoinAndSelect("order.vendorShippings", "vendorShippings")
            .where("orderItems.vendorId = :vendorId", { vendorId }) // Filter by vendorId
            .orderBy("order.createdAt", "DESC")
            .getMany(); // Get all matching orders

        return orders.map((o) => sanitizeOrderForVendor(o, vendorId));
    }

    /**
     * Get detailed information about a specific order for a vendor,
     * only if the order contains items sold by that vendor.
     *
     * Vendor-scoped: excludes the order's grand total, other vendors' items,
     * and the cross-vendor shipping breakdown — a vendor must never see
     * another vendor's shipping or settlement information.
     *
     * @param {number} vendorId - The ID of the vendor requesting the order details.
     * @param {number} orderId - The ID of the order to retrieve.
     * @throws {APIError} - Throws 404 if order not found or vendor not authorized.
     * @access Vendor
     */
    async getVendorOrderDetails(
        vendorId: number,
        orderId: number,
    ): Promise<SanitizedVendorOrderView> {
        // Query the order with all relevant relations and filter by orderId and vendorId
        const order = await this.orderRepository
            .createQueryBuilder("order")
            .leftJoinAndSelect("order.orderItems", "orderItems") // Join order items
            .leftJoinAndSelect("order.orderedBy", "orderedBy") // Join user who placed order
            .leftJoinAndSelect("order.shippingAddress", "shippingAddress") // Join shipping address
            .leftJoinAndSelect("orderItems.product", "product") // Join products in order items
            .leftJoinAndSelect("orderItems.vendor", "vendor") // Join vendor info for order items
            .leftJoinAndSelect("orderItems.variant", "variant")
            .leftJoinAndSelect("order.vendorShippings", "vendorShippings")
            .where("order.id = :orderId", { orderId }) // Filter by order ID
            .andWhere("orderItems.vendorId = :vendorId", { vendorId })
            .getOne();

        // Throw error if no such order exists or vendor is not authorized to view it
        if (!order) {
            throw new APIError(
                404,
                "Order not found or you are not authorized to view it",
            );
        }

        return sanitizeOrderForVendor(order, vendorId);
    }

    /**
     * Retrieve the order history for a specific customer,
     * including order items, products, and shipping address,
     * ordered by most recent first.
     *
     * @param {number} userId - The ID of the customer.
     * @returns {Promise<Order[]>} - List of orders made by the customer.
     * @access Customer
     */
    async getOrderHistoryForCustomer(
        userId: number,
    ): Promise<SanitizedOrderFull[]> {
        // Find all orders where orderedById matches the userId
        // Include relations: orderItems, the products within those items, and shipping address
        const orders = await this.orderRepository.find({
            where: { orderedById: userId },
            relations: [
                "orderItems",
                "orderItems.product",
                "orderItems.variant",
                "orderItems.vendor",
                "orderItems.vendor.district",
                "shippingAddress",
                "vendorShippings",
            ],
            order: { createdAt: "DESC" }, // Sort orders by creation date descending
        });

        return orders.map(sanitizeOrderFull);
    }

    async getOrderDetailByMerchantTransactionId(mTransactionId: string) {
        const order = await this.orderRepository.findOne({
            where: {
                mTransactionId: mTransactionId,
            },
        });

        return order;
    }

    async deleteOrder() {
        const order = await this.orderRepository.delete({});
    }
}
