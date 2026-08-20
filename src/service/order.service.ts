import { Brackets, EntityManager, In, Not, Repository } from "typeorm";
import AppDataSource from "../config/db.config";
import { APIError } from "../errors/ApiError";
import {
    IShippingAddressRequest,
    IUpdateOrderStatusRequest,
    IOrderCreateRequest,
    IAdminOrderQueryParams,
    IPaginatedResult,
    IVendorOrderQueryParams,
} from "../interface/order.interface";
import {
    Order,
    OrderStatus,
    PaymentStatus,
    PaymentMethod,
    DeliveryStatus,
} from "../entities/order.entity";
import { Address } from "../entities/address.entity";
import {
    CheckoutDraft,
    CheckoutDraftStatus,
    CHECKOUT_DRAFT_TTL_MS,
} from "../entities/checkoutDraft.entity";
import { OrderItem } from "../entities/orderItems.entity";
import { OrderVendorShipping } from "../entities/orderVendorShipping.entity";
import {
    OrderStatusHistory,
    OrderStatusChangedByRole,
} from "../entities/orderStatusHistory.entity";
import { AuditActorType } from "../entities/auditLog.entity";
import { auditService } from "./audit.service";
import {
    canTransition,
    StatusActorRole,
} from "../constants/orderStatus.constants";
import {
    InvalidOrderStatusTransitionError,
    OrderStateChangedError,
} from "../errors/HttpErrors";
import { Cart } from "../entities/cart.entity";
import { CartItem } from "../entities/cartItem.entity";
import { User } from "../entities/user.entity";
import { CartService } from "./cart.service";
import { getAgeRestrictionSummary } from "./age-restriction.service";
import { PaymentService } from "./payment.service";
import { District } from "../entities/district.entity";
import { Product } from "../entities/product.entity";
import { PromoService } from "./promo.service";
import { DiscountType, InventoryStatus } from "../entities/product.enum";
import { Variant } from "../entities/variant.entity";
import { findUserById } from "./user.service";
import { resolveFinalPrice } from "../utils/pricing.utils";
import {
    sendCustomerOrderEmail,
    sendOrderStatusEmail,
    sendVendorOrderEmail,
    sendVendorOrderStatusEmail,
    sendAdminOrderCreatedEmail,
    sendAdminOrderDeliveredEmail,
    AdminOrderEmailData,
} from "../utils/nodemailer.utils";
import { NotificationService } from "./notification.service";
import crypto from "crypto";
import axios from "axios";
import { Promo, PromoType } from "../entities/promo.entity";
import {
    normalizePromoCode,
    isPromoUsable,
    calculatePromoDiscount,
} from "./promoRules";
import { DealStatus } from "../entities/deal.entity";
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
import {
    emitOrderStatusUpdate,
    emitProductStockUpdate,
} from "../socket/socket";
import { dispatchStatusSideEffects } from "../utils/status-side-effects.utils";
import { NpsPaymentService } from "./nps-payment.service";

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
    private checkoutDraftRepository: Repository<CheckoutDraft>;
    private npsPaymentService: NpsPaymentService;

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
        this.checkoutDraftRepository =
            AppDataSource.getRepository(CheckoutDraft);
        this.npsPaymentService = new NpsPaymentService();
    }

    private calculateLineItemPrice(item: any): number {
        // Always prefer the persisted finalPrice: a product/variant with an
        // active Deal has its own discount/discountType zeroed out at save
        // time (the Deal price lives only in finalPrice), so recomputing from
        // discount/discountType alone would silently drop the Deal and charge
        // full price. resolveFinalPrice only recomputes as a fallback when
        // finalPrice is missing/invalid.
        if (item?.variant) {
            return resolveFinalPrice({
                finalPrice: item.variant.finalPrice,
                basePrice: item.variant.basePrice,
                discountAmount: item.variant.discountAmount,
            });
        }

        return resolveFinalPrice({
            finalPrice: item?.product?.finalPrice,
            basePrice: item?.product?.basePrice,
            discountAmount: item?.product?.discountAmount,
        });
    }

    private buildLinePriceSnapshot(item: any) {
        const source = item?.variant || item?.product || {};
        const product = item?.product || {};
        const basePrice = Number(source.basePrice ?? item?.price ?? 0) || 0;
        const unitPrice = this.calculateLineItemPrice(item);
        const discountType = source.discountType ?? DiscountType.NONE;
        const hasProductDiscount =
            discountType !== DiscountType.NONE &&
            Number(source.discountAmount ?? 0) > 0;
        const deal =
            product.deal && product.deal.status === DealStatus.ENABLED
                ? product.deal
                : null;

        const productDiscountAmount = hasProductDiscount
            ? Math.min(Number(source.discountAmount) || 0, basePrice)
            : !deal
              ? Math.max(0, basePrice - unitPrice)
              : 0;
        const dealDiscountAmount = deal
            ? Math.max(0, basePrice - productDiscountAmount - unitPrice)
            : 0;

        return {
            basePrice,
            unitPrice,
            productDiscountAmount,
            dealDiscountAmount,
            discountType,
            discountLabel: hasProductDiscount
                ? discountType === DiscountType.FLAT
                    ? `Flat discount`
                    : `${Number(source.discountPercent ?? source.discount ?? 0) || 0}% discount`
                : null,
            dealName: deal?.name ?? null,
            dealPercent: deal ? Number(deal.discountPercentage) || null : null,
        };
    }

    private buildCheckoutPriceBreakdown(
        items: any[],
        promoDiscountAmount = 0,
        appliedPromoCode: string | null = null,
    ) {
        const lineItems = items.map((item) => {
            const snapshot = this.buildLinePriceSnapshot(item);
            const quantity = Number(item.quantity) || 0;
            const lineBaseTotal = snapshot.basePrice * quantity;
            const lineTotal = snapshot.unitPrice * quantity;
            const productDiscountTotal =
                snapshot.productDiscountAmount * quantity;
            const dealDiscountTotal = snapshot.dealDiscountAmount * quantity;

            return {
                productId: item.product?.id ?? null,
                variantId: item.variant?.id ?? null,
                name: item.product?.name ?? "Product",
                quantity,
                basePrice: snapshot.basePrice,
                unitPrice: snapshot.unitPrice,
                lineBaseTotal,
                lineTotal,
                productDiscount: {
                    label: snapshot.discountLabel,
                    type: snapshot.discountType,
                    amount: productDiscountTotal,
                },
                dealDiscount: {
                    label: snapshot.dealName,
                    percent: snapshot.dealPercent,
                    amount: dealDiscountTotal,
                },
                savingsTotal: productDiscountTotal + dealDiscountTotal,
            };
        });

        return {
            actualPrice: lineItems.reduce(
                (sum, item) => sum + item.lineBaseTotal,
                0,
            ),
            merchandiseSubtotal: lineItems.reduce(
                (sum, item) => sum + item.lineTotal,
                0,
            ),
            productDiscountTotal: lineItems.reduce(
                (sum, item) => sum + item.productDiscount.amount,
                0,
            ),
            dealDiscountTotal: lineItems.reduce(
                (sum, item) => sum + item.dealDiscount.amount,
                0,
            ),
            promoDiscountTotal: promoDiscountAmount,
            appliedPromoCode,
            lineItems,
        };
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
                "items.product.subcategory",
                "items.product.subcategory.category",
                "items.product.deal",
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
            const priceSnapshot = this.buildLinePriceSnapshot(item);
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
                basePriceSnapshot: priceSnapshot.basePrice,
                productDiscountSnapshot: priceSnapshot.productDiscountAmount,
                dealDiscountSnapshot: priceSnapshot.dealDiscountAmount,
                discountTypeSnapshot: priceSnapshot.discountType,
                discountLabelSnapshot: priceSnapshot.discountLabel,
                dealNameSnapshot: priceSnapshot.dealName,
                dealPercentSnapshot: priceSnapshot.dealPercent,
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
        const { discountAmount, appliedPromoCode, applyOn } =
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
            promoApplyOn: applyOn,
            status: OrderStatus.ORDER_PLACED,
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

    /**
     * Persist a priced checkout as a CheckoutDraft (online payments only).
     * Nothing is reserved or claimed here — the draft is just a validated
     * snapshot that materializeDraftOrder() turns into a real Order once
     * the payment gateway confirms success.
     */
    private async createCheckoutDraft(args: {
        userId: number;
        orderData: IOrderCreateRequest;
        order: Order;
        vendorShippingRows: Array<Record<string, any>>;
        address: Address;
        isBuyNow: boolean;
        items: any[];
    }): Promise<CheckoutDraft> {
        const { userId, orderData, order, vendorShippingRows, address, isBuyNow, items } =
            args;

        const draft = this.checkoutDraftRepository.create({
            userId,
            status: CheckoutDraftStatus.PENDING,
            paymentMethod: order.paymentMethod,
            orderNumber: order.orderNumber,
            payload: {
                fullName: orderData.fullName,
                phoneNumber: orderData.phoneNumber,
                shippingAddress: orderData.shippingAddress,
                isBuyNow: Boolean(isBuyNow),
                productId: orderData.productId ?? null,
                variantId: orderData.variantId ?? null,
                quantity: orderData.quantity ?? null,
                promoCode: orderData.promoCode ?? null,
                ageRestrictedAcknowledged: Boolean(
                    orderData.ageRestrictedAcknowledged,
                ),
                idempotencyKey: orderData.idempotencyKey ?? null,
                instrumentName: orderData.instrumentName ?? null,
            },
            items: items.map((item) => ({
                productId: item.product.id,
                variantId: item.variant ? item.variant.id : null,
                quantity: item.quantity,
                price: this.calculateLineItemPrice(item),
            })),
            totals: {
                totalPrice: order.totalPrice,
                shippingFee: order.shippingFee,
                merchandiseSubtotal: order.merchandiseSubtotal,
                discountTotal: order.discountTotal,
                taxTotal: order.taxTotal,
                serviceCharge: order.serviceCharge,
                appliedPromoCode: order.appliedPromoCode ?? null,
                promoApplyOn: order.promoApplyOn ?? null,
                vendorShippingRows,
            },
            addressId: address.id,
            expiresAt: new Date(Date.now() + CHECKOUT_DRAFT_TTL_MS),
        });

        return await this.checkoutDraftRepository.save(draft);
    }

    /**
     * Materialize a PENDING CheckoutDraft into a real Order.
     *
     * Called ONLY after a payment gateway confirms success (eSewa callback,
     * NPS status check, or NPS webhook). Idempotent: a COMPLETED draft
     * returns its existing order. Stock is revalidated and decremented, and
     * the promo usage slot is claimed, inside one row-locked transaction —
     * the same guarantees as the COD path.
     *
     * @param draft - The checkout draft to materialize.
     * @param transactionId - Gateway transaction reference stored on the
     *   order (eSewa transaction_uuid or NPS MerchantTxnId).
     */
    async materializeDraftOrder(
        draft: CheckoutDraft,
        transactionId?: string | null,
    ): Promise<Order> {
        // Idempotency: duplicate gateway callbacks must return the same order.
        if (draft.status === CheckoutDraftStatus.COMPLETED && draft.orderId) {
            const existing = await this.orderRepository.findOne({
                where: { id: draft.orderId },
                relations: [
                    "orderItems",
                    "orderItems.product",
                    "orderItems.variant",
                    "vendorShippings",
                ],
                withDeleted: true,
            });
            if (existing) return existing;
        }

        if (draft.status !== CheckoutDraftStatus.PENDING) {
            throw new APIError(400, "This checkout session has ended");
        }

        if (draft.expiresAt && draft.expiresAt <= new Date()) {
            await this.checkoutDraftRepository
                .update(
                    { id: draft.id, status: CheckoutDraftStatus.PENDING },
                    { status: CheckoutDraftStatus.EXPIRED },
                )
                .catch(() => undefined);
            throw new APIError(400, "This checkout session has expired");
        }

        let orderId: number;
        try {
            const result = await AppDataSource.transaction(async (manager) => {
                const draftRepo = manager.getRepository(CheckoutDraft);

                // Serialize concurrent callbacks (redirect + webhook + poll).
                const lockedDraft = await draftRepo.findOne({
                    where: { id: draft.id },
                    lock: { mode: "pessimistic_write" },
                });
                if (!lockedDraft) {
                    throw new APIError(404, "Checkout session not found");
                }
                if (
                    lockedDraft.status === CheckoutDraftStatus.COMPLETED &&
                    lockedDraft.orderId
                ) {
                    return { alreadyCompleted: true, orderId: lockedDraft.orderId };
                }
                if (lockedDraft.status !== CheckoutDraftStatus.PENDING) {
                    throw new APIError(400, "This checkout session has ended");
                }

                const payload = lockedDraft.payload || {};
                const totals = lockedDraft.totals || {};

                const user = await manager
                    .getRepository(User)
                    .findOne({ where: { id: lockedDraft.userId } });
                if (!user) {
                    throw new APIError(404, "Customer account not found");
                }

                // Reload products/variants fresh — pricing relations (deal,
                // subcategory, vendor) must be present for the OrderItem
                // snapshots, and availability is re-checked here.
                const items: any[] = [];
                for (const snap of lockedDraft.items || []) {
                    const product = await manager
                        .getRepository(Product)
                        .findOne({
                            where: { id: snap.productId },
                            relations: [
                                "variants",
                                "subcategory",
                                "subcategory.category",
                                "vendor",
                                "vendor.district",
                                "deal",
                            ],
                        });
                    if (!product) {
                        throw new APIError(
                            400,
                            "An item in your checkout is no longer available",
                        );
                    }
                    let variant = null;
                    if (snap.variantId) {
                        variant = await manager
                            .getRepository(Variant)
                            .findOne({ where: { id: snap.variantId } });
                        if (!variant) {
                            throw new APIError(
                                400,
                                "An item in your checkout is no longer available",
                            );
                        }
                    }
                    items.push({ product, variant, quantity: snap.quantity });
                }

                // Reuse the stored address when it still exists; otherwise
                // rebuild it from the payload snapshot so a paid checkout
                // can never fail just because the address row changed.
                let address = lockedDraft.addressId
                    ? await manager.getRepository(Address).findOne({
                          where: { id: lockedDraft.addressId },
                      })
                    : null;
                if (!address) {
                    const ship = payload.shippingAddress || {};
                    const resolvedDistrict =
                        await this.shippingService.resolveDistrictByName(
                            ship.district,
                        );
                    const rebuilt = manager.getRepository(Address).create({
                        province: ship.province,
                        district: ship.district,
                        districtId: resolvedDistrict?.id ?? null,
                        city: ship.city,
                        localAddress: ship.streetAddress,
                        landmark: ship.landmark,
                        userId: lockedDraft.userId,
                    });
                    address = await manager.getRepository(Address).save(rebuilt);
                }

                const orderItems = this.createOrderItems(items);

                const orderEntity = manager.getRepository(Order).create({
                    orderedById: lockedDraft.userId,
                    orderedBy: user,
                    orderNumber: lockedDraft.orderNumber,
                    idempotencyKey: payload.idempotencyKey || null,
                    totalPrice: totals.totalPrice,
                    shippingFee: totals.shippingFee,
                    merchandiseSubtotal: totals.merchandiseSubtotal,
                    discountTotal: totals.discountTotal,
                    taxTotal: totals.taxTotal || 0,
                    serviceCharge: totals.serviceCharge || 0,
                    instrumentName: payload.instrumentName || null,
                    paymentMethod: lockedDraft.paymentMethod,
                    appliedPromoCode: totals.appliedPromoCode || null,
                    promoApplyOn: totals.promoApplyOn || null,
                    paymentStatus: PaymentStatus.UNPAID,
                    status: OrderStatus.ORDER_PLACED,
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
                    isBuyNow: Boolean(payload.isBuyNow),
                    phoneNumber: payload.phoneNumber,
                });

                let savedOrder = await manager
                    .getRepository(Order)
                    .save(orderEntity);

                // Claim the promo usage slot atomically with the order save,
                // exactly like the COD path in reserveStockAndSaveOrder.
                if (savedOrder.appliedPromoCode) {
                    const claimed = await this.claimPromoUsage(
                        savedOrder.appliedPromoCode,
                        manager,
                    );
                    if (!claimed) {
                        throw new APIError(
                            400,
                            "Promo code usage limit has been reached. Remove the promo code and try again.",
                        );
                    }
                }

                const vendorShippingRows: Array<Record<string, any>> =
                    totals.vendorShippingRows || [];
                if (vendorShippingRows.length) {
                    await manager.getRepository(OrderVendorShipping).save(
                        vendorShippingRows.map(
                            (row): Partial<OrderVendorShipping> => ({
                                ...row,
                                shippingZone: row.shippingZone as any,
                                orderId: savedOrder.id,
                            }),
                        ),
                    );
                }

                savedOrder = await manager.getRepository(Order).findOne({
                    where: { id: savedOrder.id },
                    relations: [
                        "orderItems",
                        "orderItems.product",
                        "orderItems.variant",
                        "vendorShippings",
                    ],
                    withDeleted: true,
                });
                if (!savedOrder) {
                    throw new APIError(500, "Failed to create order");
                }

                await this.updateStock(savedOrder.orderItems, manager);

                lockedDraft.status = CheckoutDraftStatus.COMPLETED;
                lockedDraft.orderId = savedOrder.id;
                await draftRepo.save(lockedDraft);

                return { alreadyCompleted: false, orderId: savedOrder.id };
            });

            orderId = result.orderId;
        } catch (error) {
            // The gateway already collected money — this is a reconciliation
            // case. Mark the draft cancelled, log loudly with the transaction
            // reference, and surface an explicit support-facing message.
            await this.checkoutDraftRepository
                .update(
                    { id: draft.id, status: CheckoutDraftStatus.PENDING },
                    { status: CheckoutDraftStatus.CANCELLED },
                )
                .catch(() => undefined);
            console.error(
                `[CHECKOUT-DRAFT] Payment succeeded but order materialization failed. draftId=${draft.id} orderNumber=${draft.orderNumber} transactionId=${transactionId ?? "n/a"}`,
                error,
            );
            throw new APIError(
                500,
                "Your payment was received but the order could not be completed. Please contact support with your transaction reference.",
            );
        }

        // Mark paid + fire payment/order notifications through the same
        // idempotent path used by gateway callbacks (orderSuccess no-ops
        // if the order is already PAID).
        await this.orderSuccess(
            orderId,
            transactionId || draft.esewaTransactionUuid || "",
        );

        const finalOrder = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderItems",
                "orderItems.product",
                "orderItems.variant",
                "vendorShippings",
            ],
            withDeleted: true,
        });
        if (!finalOrder) {
            throw new APIError(500, "Failed to load materialized order");
        }

        // Cart clear (sendOrderEmails also clears for non-buy-now), emails,
        // audit trail and stock broadcast — same side effects as a COD order.
        try {
            await this.sendOrderEmails(orderId);
        } catch (error) {
            console.error("[CHECKOUT-DRAFT] Failed to send order emails:", error);
        }

        await this.recordStatusChange(orderId, null, OrderStatus.ORDER_PLACED, {
            reason: "Order placed (online payment confirmed)",
            changedByUserId: draft.userId,
            changedByRole: OrderStatusChangedByRole.CUSTOMER,
        });

        emitProductStockUpdate({
            productIds: [
                ...new Set(
                    finalOrder.orderItems
                        .map((item) => Number(item.productId))
                        .filter((id) => Number.isInteger(id) && id > 0),
                ),
            ],
            variantIds: [
                ...new Set(
                    finalOrder.orderItems
                        .map((item) => Number(item.variantId))
                        .filter((id) => Number.isInteger(id) && id > 0),
                ),
            ],
        });

        return finalOrder;
    }

    /**
     * Cancel a still-PENDING draft (payment failed/cancelled at gateway).
     * No stock or promo was ever reserved, so there is nothing to restore.
     * Idempotent — already-terminal drafts are left untouched.
     */
    async cancelCheckoutDraft(
        draft: CheckoutDraft,
        reason: string,
    ): Promise<void> {
        if (draft.status !== CheckoutDraftStatus.PENDING) return;
        await this.checkoutDraftRepository
            .update(
                { id: draft.id, status: CheckoutDraftStatus.PENDING },
                { status: CheckoutDraftStatus.CANCELLED },
            )
            .catch((error) =>
                console.error(
                    `[CHECKOUT-DRAFT] Failed to cancel draft ${draft.id} (${reason}):`,
                    error,
                ),
            );
    }

    /**
     * Cron hook: expire PENDING drafts whose TTL elapsed without a gateway
     * verdict. Returns the number of drafts expired.
     */
    async expireStaleCheckoutDrafts(now: Date = new Date()): Promise<number> {
        const result = await this.checkoutDraftRepository
            .createQueryBuilder()
            .update(CheckoutDraft)
            .set({ status: CheckoutDraftStatus.EXPIRED })
            .where("status = :status", { status: CheckoutDraftStatus.PENDING })
            .andWhere('"expiresAt" <= :now', { now })
            .execute();
        return result.affected ?? 0;
    }

    /**
     * Synthetic order-shaped view of a draft, used by the merchant-
     * transaction lookup while the gateway hasn't settled yet. Keeps the
     * existing Transaction.tsx polling contract (pending → keep polling,
     * cancelled → show cancelled) without any frontend change.
     */
    private buildDraftOrderView(
        draft: CheckoutDraft,
        paymentStatus: PaymentStatus,
        status: OrderStatus,
    ): Order {
        const totals = draft.totals || {};
        return {
            id: 0,
            orderNumber: draft.orderNumber,
            orderedById: draft.userId,
            paymentStatus,
            paymentMethod: draft.paymentMethod,
            status,
            deliveryStatus: DeliveryStatus.ORDER_PROCESSING,
            totalPrice: totals.totalPrice ?? 0,
            shippingFee: totals.shippingFee ?? 0,
            merchandiseSubtotal: totals.merchandiseSubtotal ?? 0,
            discountTotal: totals.discountTotal ?? 0,
            taxTotal: totals.taxTotal ?? 0,
            serviceCharge: totals.serviceCharge ?? 0,
            mTransactionId: draft.mTransactionId ?? null,
            instrumentName: draft.payload?.instrumentName ?? null,
            createdAt: draft.createdAt,
            updatedAt: draft.updatedAt,
            orderItems: [],
        } as unknown as Order;
    }

    /** Single place that applies a promo code — used by both checkout
     * (`createOrderEntity`) and the pre-checkout estimate, so the discount a
     * customer previews always matches what actually gets charged. */
    private async calculateDiscount(
        userId: number,
        promoCode: string | undefined,
        merchandiseSubtotal: number,
        shippingTotal: number,
    ): Promise<{
        discountAmount: number;
        appliedPromoCode: string | null;
        applyOn: PromoType | null;
    }> {
        const normalized = normalizePromoCode(promoCode);
        if (!normalized)
            return { discountAmount: 0, appliedPromoCode: null, applyOn: null };

        const promo = await this.promoService.findPromoByCode(normalized);

        // One-time-per-user: the promo may only be redeemed once by a user on
        // a completed order. Matching is case-insensitive because old rows can
        // hold codes in mixed case.
        const alreadyUsedByUser = promo
            ? (await this.orderRepository
                  .createQueryBuilder("order")
                  .where(
                      "LOWER(order.appliedPromoCode) = LOWER(:code) AND order.orderedById = :userId",
                      { code: normalized, userId },
                  )
                  .andWhere("order.status IN (:...statuses)", {
                      statuses: [OrderStatus.DELIVERED, OrderStatus.CONFIRMED],
                  })
                  .getCount()) > 0
            : false;

        const { usable } = isPromoUsable(promo, { alreadyUsedByUser });
        if (!usable)
            return { discountAmount: 0, appliedPromoCode: null, applyOn: null };

        const discountAmount = calculatePromoDiscount(
            promo,
            merchandiseSubtotal,
            shippingTotal,
        );

        return {
            discountAmount,
            appliedPromoCode: promo.promoCode,
            applyOn: promo.applyOn,
        };
    }

    /**
     * Atomically claim one usage slot for a promo. Single conditional UPDATE
     * (not a read-modify-write), so concurrent orders can never push usage
     * past maxUsageCount. Returns whether a slot was actually claimed.
     */
    private async claimPromoUsage(
        promoCode: string,
        manager?: EntityManager,
    ): Promise<boolean> {
        const normalized = normalizePromoCode(promoCode);
        if (!normalized) return false;

        const promoRepo = manager
            ? manager.getRepository(Promo)
            : AppDataSource.getRepository(Promo);

        const result = await promoRepo
            .createQueryBuilder()
            .update(Promo)
            .set({ usageCount: () => '"usageCount" + 1' })
            .where(
                'LOWER("promoCode") = LOWER(:code) AND ("maxUsageCount" = 0 OR "usageCount" < "maxUsageCount")',
                { code: normalized },
            )
            .execute();

        return (result.affected ?? 0) > 0;
    }

    /**
     * Release one claimed usage slot (used when an order that applied a promo
     * is cancelled / payment fails). Guarded so it never drives usageCount
     * below zero.
     */
    private async releasePromoUsage(
        promoCode: string | null | undefined,
    ): Promise<void> {
        const normalized = normalizePromoCode(promoCode);
        if (!normalized) return;

        await AppDataSource.getRepository(Promo)
            .createQueryBuilder()
            .update(Promo)
            .set({ usageCount: () => 'GREATEST("usageCount" - 1, 0)' })
            .where('LOWER("promoCode") = LOWER(:code) AND "usageCount" > 0', {
                code: normalized,
            })
            .execute();
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
                relations: ["variants", "vendor", "vendor.district", "deal"],
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
            priceBreakdown: this.buildCheckoutPriceBreakdown(
                items,
                discountAmount,
                appliedPromoCode,
            ),
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
        const normalized = normalizePromoCode(promoCode);
        if (!normalized) return null;

        const promo = await this.promoService.findPromoByCode(normalized);

        const alreadyUsedByUser = promo
            ? (await this.orderRepository
                  .createQueryBuilder("order")
                  .where(
                      "LOWER(order.appliedPromoCode) = LOWER(:code) AND order.orderedById = :userId",
                      { code: normalized, userId },
                  )
                  .andWhere("order.status IN (:...statuses)", {
                      statuses: [OrderStatus.DELIVERED, OrderStatus.CONFIRMED],
                  })
                  .getCount()) > 0
            : false;

        const { usable } = isPromoUsable(promo, { alreadyUsedByUser });
        return usable ? promo : null;
    }

    async trackOrder(email: string, orderNumber: string) {
        const order = await this.orderRepository.findOne({
            where: {
                orderNumber: orderNumber,
                orderedBy: {
                    email: email.toLowerCase(),
                },
            },
            relations: ["orderedBy"],
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
            throw new APIError(404, "User not found");
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
        order?: Order;
        draft?: CheckoutDraft;
        redirectUrl?: string;
        vendorids: any[];
        useremail: string;
        esewaRedirectUrl: { url: string } | undefined;
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
                    withDeleted: true,
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
                    relations: [
                        "variants",
                        "subcategory",
                        "subcategory.category",
                        "vendor",
                        "vendor.district",
                        "deal",
                    ],
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

            const ageSummary = getAgeRestrictionSummary(
                items.map((item) => item.product),
            );
            if (
                ageSummary.containsRestrictedItems &&
                !orderData.ageRestrictedAcknowledged
            ) {
                throw new APIError(
                    400,
                    "Age confirmation is required for restricted products",
                );
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
                // Deferred order creation: an online-payment checkout only
                // becomes a real Order after the gateway confirms success.
                // Here we persist a priced CheckoutDraft instead — no order
                // row, no stock reservation, no promo claim — so cancelling
                // or abandoning the payment never leaves a phantom order
                // behind. materializeDraftOrder() creates the order later.
                const draft = await this.createCheckoutDraft({
                    userId,
                    orderData,
                    order,
                    vendorShippingRows,
                    address,
                    isBuyNow,
                    items,
                });

                if (paymentMethod === PaymentMethod.ESEWA) {
                    esewaRedirectUrl =
                        await this.initateEsewaPaymentForDraft(draft);
                }

                return {
                    draft,
                    esewaRedirectUrl,
                    vendorids,
                    useremail,
                };
            } else {
                throw new APIError(400, "Invalid payment method");
            }

            // Emit only after reserveStockAndSaveOrder commits. Browsers use
            // this to invalidate their product/cart view, while the database
            // transaction above remains the only authority for stock.
            emitProductStockUpdate({
                productIds: [
                    ...new Set(
                        order.orderItems
                            .map((item) => Number(item.productId))
                            .filter((id) => Number.isInteger(id) && id > 0),
                    ),
                ],
                variantIds: [
                    ...new Set(
                        order.orderItems
                            .map((item) => Number(item.variantId))
                            .filter((id) => Number.isInteger(id) && id > 0),
                    ),
                ],
            });

            // Promo usage is claimed atomically inside reserveStockAndSaveOrder's
            // transaction (see above), so it commits/rolls back with the order
            // save and stock reservation — nothing to do here.

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
            // Rethrow as-is — do NOT collapse to a generic message here.
            // globalErrorHandler's normalizeError() already knows how to turn a
            // QueryFailedError, EntityNotFoundError, etc. into a safe, correctly
            // typed response; swallowing the real error/message/stack here (as
            // this used to do) is what made every order-creation failure show up
            // as an opaque "Failed to create order" with no way to diagnose it.
            throw error;
        }
    }

    async esewaSuccess(token: string, orderId?: number, draftId?: number) {
        try {
            let object = JSON.parse(
                Buffer.from(token, "base64").toString("ascii"),
            );

            if (object.status !== "COMPLETE") {
                // Cancel the pending draft (nothing was reserved), or release
                // the stock reserved at order creation for legacy orders —
                // otherwise a non-complete eSewa callback leaves it locked
                // up forever.
                const pendingDraft = draftId
                    ? await this.checkoutDraftRepository.findOne({
                          where: {
                              id: draftId,
                              status: CheckoutDraftStatus.PENDING,
                          },
                      })
                    : null;
                if (pendingDraft) {
                    await this.cancelCheckoutDraft(
                        pendingDraft,
                        "eSewa returned non-complete status",
                    );
                } else if (orderId) {
                    await this.esewaFailed(orderId);
                }
                throw new APIError(400, "Payment not completed");
            }

            // Draft-based checkout: resolve by the eSewa transaction uuid —
            // unambiguous even though draft ids and order ids share a number
            // space. Falls back to legacy order handling for orders created
            // before the draft flow shipped.
            const draft = object.transaction_uuid
                ? await this.checkoutDraftRepository.findOne({
                      where: {
                          esewaTransactionUuid: object.transaction_uuid,
                      },
                  })
                : null;

            if (draft) {
                const order = await this.materializeDraftOrder(
                    draft,
                    object.transaction_uuid,
                );
                return {
                    success: true,
                    orderId: order.id,
                    orderNumber: order.orderNumber,
                };
            }

            if (!orderId) {
                throw new APIError(404, "Checkout session not found");
            }

            // order success (legacy path)
            await this.orderSuccess(orderId, object.transaction_uuid);

            // Send emails to customer and vendors
            await this.sendOrderEmails(orderId);

            return { success: true, orderId };
        } catch (err) {
            // Same fix as createOrder above: this used to unconditionally wrap
            // *any* error — including the intentional 400 "Payment not completed"
            // thrown two lines up — into a flat 500, hiding the real cause.
            throw err;
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

    public async sendAdminOrderPlacedEmail(orderId: number): Promise<void> {
        if (!config.USER_EMAIL) return;

        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderedBy",
                "shippingAddress",
                "orderItems",
                "orderItems.product",
                "orderItems.product.subcategory",
                "orderItems.product.subcategory.category",
                "orderItems.product.deal",
                "orderItems.variant",
                "orderItems.vendor",
                "orderItems.vendor.district",
                "vendorShippings",
            ],
            withDeleted: true,
        });

        if (!order) {
            throw new APIError(404, `Order with ID ${orderId} not found`);
        }

        const adminEmailData = await this.buildAdminOrderEmailData(order);
        await sendAdminOrderCreatedEmail(config.USER_EMAIL, adminEmailData);
    }

    private async buildAdminOrderEmailData(
        order: any,
    ): Promise<AdminOrderEmailData> {
        const addr = order.shippingAddress || {};
        const addrParts = [addr.localAddress, addr.city, addr.district].filter(
            Boolean,
        );
        const formattedAddress = addrParts.join(", ") || "N/A";

        const orderDate = order.createdAt
            ? new Date(order.createdAt).toLocaleString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
              })
            : "N/A";

        // Group items by vendor
        const itemsByVendorId = new Map<number, any[]>();
        for (const item of order.orderItems || []) {
            const vid = item.vendorId;
            if (!itemsByVendorId.has(vid)) itemsByVendorId.set(vid, []);
            itemsByVendorId.get(vid)!.push(item);
        }

        // Build per-vendor shipping lookup from vendorShippings snapshot
        const shippingByVendorId = new Map<number, number>();
        for (const vs of order.vendorShippings || []) {
            shippingByVendorId.set(vs.vendorId, Number(vs.shippingFee) || 0);
        }

        // Build district shipping breakdown de-duplicated by vendor district
        const districtShippingMap = new Map<string, number>();
        for (const vs of order.vendorShippings || []) {
            const district =
                vs.vendorDistrictSnapshot ||
                vs.vendor?.district?.name ||
                "Unknown";
            const existing = districtShippingMap.get(district) || 0;
            districtShippingMap.set(
                district,
                existing + (Number(vs.shippingFee) || 0),
            );
        }
        const districtShipping = Array.from(districtShippingMap.entries()).map(
            ([district, fee]) => ({ district, fee }),
        );

        // Build vendor sections
        const vendors = Array.from(itemsByVendorId.entries()).map(
            ([vendorId, items]) => {
                const sampleItem = items[0];
                const vendor = sampleItem?.vendor;

                const vendorItems = items.map((item: any) => {
                    const unitPrice =
                        Number(item.unitPriceSnapshot ?? item.price) || 0;
                    const basePrice =
                        Number(item.basePriceSnapshot ?? unitPrice) || 0;
                    const productDiscount =
                        Number(item.productDiscountSnapshot) || 0;
                    const dealDiscount = Number(item.dealDiscountSnapshot) || 0;
                    const totalDiscount =
                        (productDiscount + dealDiscount) * item.quantity;
                    const lineTotal = unitPrice * item.quantity;

                    const variantAttrs = item.variant?.attributes;
                    const variantStr = variantAttrs
                        ? Object.entries(variantAttrs)
                              .map(([k, v]) => `${k}: ${v}`)
                              .join(", ")
                        : null;

                    return {
                        name:
                            item.product?.name ||
                            item.productNameSnapshot ||
                            "Product",
                        variant: variantStr,
                        sku: item.variant?.sku || item.skuSnapshot || null,
                        quantity: item.quantity,
                        unitPrice,
                        discount: totalDiscount > 0 ? totalDiscount : null,
                        lineTotal,
                    };
                });

                const subtotal = vendorItems.reduce(
                    (sum: number, i: any) => sum + i.lineTotal,
                    0,
                );

                return {
                    name: vendor?.businessName || "Vendor",
                    email: vendor?.email || "",
                    phone: vendor?.phoneNumber || "",
                    district:
                        vendor?.district?.name ||
                        order.vendorShippings?.find(
                            (vs: any) => vs.vendorId === vendorId,
                        )?.vendorDistrictSnapshot ||
                        "Unknown",
                    items: vendorItems,
                    subtotal,
                    shippingFee: shippingByVendorId.get(vendorId) || 0,
                };
            },
        );

        // Look up promo type so the email can display it in the right place
        let promoApplyOn: string | null = null;
        if (order.appliedPromoCode) {
            try {
                const promo = await this.promoService.findPromoByCode(
                    order.appliedPromoCode,
                );
                promoApplyOn = promo?.applyOn || null;
            } catch {
                // Non-fatal: fall back to null — email will still show the discount amount
            }
        }

        return {
            orderNumber: order.orderNumber || String(order.id),
            orderDate,
            paymentMethod: order.paymentMethod || "",
            paymentStatus: order.paymentStatus || "",
            orderStatus: order.status || "",
            customer: {
                fullName:
                    order.orderedBy?.fullName ||
                    order.shippingAddress?.fullName ||
                    "N/A",
                email: order.orderedBy?.email || "N/A",
                phone:
                    order.phoneNumber || order.orderedBy?.phoneNumber || "N/A",
                address: formattedAddress,
                landmark: addr.landmark || null,
            },
            vendors,
            subtotal: Number(order.merchandiseSubtotal) || 0,
            shippingTotal: Number(order.shippingFee) || 0,
            discountTotal: Number(order.discountTotal) || 0,
            grandTotal: Number(order.totalPrice) || 0,
            districtShipping,
            appliedPromoCode: order.appliedPromoCode || null,
            promoApplyOn,
        };
    }

    async sendOrderEmails(orderId: number) {
        // Fetch the order with all relations
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderedBy",
                "orderedBy.address",
                "orderItems",
                "orderItems.product",
                "orderItems.product.subcategory",
                "orderItems.product.subcategory.category",
                "orderItems.variant",
                "vendorShippings",
            ],
            withDeleted: true,
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

        // Look up promo type so emails can display it in the correct location
        let promoApplyOn: string | null = null;
        if (order.appliedPromoCode) {
            try {
                const promo = await this.promoService.findPromoByCode(
                    order.appliedPromoCode,
                );
                promoApplyOn = promo?.applyOn || null;
            } catch {
                // Non-fatal
            }
        }

        const customerEmailItems = order.orderItems.map((item) => {
            const vendor = vendors.find((v) => v.id === item.vendorId);
            return {
                name: item.product.name,
                sku: item.variant?.sku || null,
                quantity: item.quantity,
                price: item.price,
                variantAttributes: item.variant?.attributes || null,
                vendorDistrict: vendor?.district?.name || null,
                basePriceSnapshot: Number(item.basePriceSnapshot) || 0,
                productDiscountSnapshot:
                    Number(item.productDiscountSnapshot) || 0,
                dealDiscountSnapshot: Number(item.dealDiscountSnapshot) || 0,
                discountLabelSnapshot: item.discountLabelSnapshot || null,
                dealNameSnapshot: item.dealNameSnapshot || null,
            };
        });

        const ageSummary = getAgeRestrictionSummary(
            order.orderItems.map((item) => item.product),
        );

        // Send customer email
        try {
            await sendCustomerOrderEmail(
                user.email,
                order.orderNumber,
                order.totalPrice,
                order.shippingFee,
                customerEmailItems,
                user.address.district || null,
                undefined,
                order.discountTotal,
                order.appliedPromoCode,
                {
                    required: ageSummary.containsRestrictedItems,
                    minimumAge: ageSummary.minimumRequiredAge,
                },
                promoApplyOn,
                order.vendorShippings,
            );
        } catch (error) {
            console.error("Failed to send customer order email:", error);
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
                    basePriceSnapshot: Number(item.basePriceSnapshot) || 0,
                    productDiscountSnapshot:
                        Number(item.productDiscountSnapshot) || 0,
                    dealDiscountSnapshot:
                        Number(item.dealDiscountSnapshot) || 0,
                    discountLabelSnapshot: item.discountLabelSnapshot || null,
                    dealNameSnapshot: item.dealNameSnapshot || null,
                }));

            if (itemsForVendor.length === 0) continue;

            try {
                await sendVendorOrderEmail(
                    vendor.email,
                    order.paymentMethod,
                    order.orderNumber,
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

    async esewaFailed(orderId?: number, draftId?: number) {
        // Draft-based checkout resolution first — the draft flow never
        // reserved stock or claimed promos, so failure handling is a single
        // idempotent status flip.
        if (draftId) {
            const draft = await this.checkoutDraftRepository.findOne({
                where: { id: draftId },
            });
            if (draft && draft.status === CheckoutDraftStatus.PENDING) {
                await this.cancelCheckoutDraft(draft, "eSewa payment failed");
                return { success: true };
            }
            if (draft && !orderId && draft.orderId) {
                // Completed draft — route the failure callback to its order.
                orderId = draft.orderId;
            }
            if (!orderId) {
                // Already cancelled/expired with no order — nothing to do.
                return { success: true };
            }
        }

        try {
            if (!orderId) {
                throw new APIError(404, "Checkout session not found");
            }

            const order = await this.orderRepository.findOne({
                where: { id: orderId },
                relations: [
                    "orderItems",
                    "orderItems.product",
                    "orderItems.variant",
                ],
                withDeleted: true,
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
            if (!alreadyTerminal) {
                // The order never fulfilled, so give the promo slot back.
                await this.releasePromoUsage(order.appliedPromoCode).catch(
                    (err) =>
                        console.error("Failed to release promo usage:", err),
                );
            }
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

            // Payment gateway callbacks can be retried. Do not repeat customer
            // push/email side effects after a callback already marked this paid.
            if (order.paymentStatus === PaymentStatus.PAID) return order;

            // Update payment state only. Fulfillment confirmation remains an
            // admin action, even after successful online payment.
            order.paymentStatus = PaymentStatus.PAID;
            order.mTransactionId = transactionId;
            await this.orderRepository.save(order);
            await this.notificationService.notifyPaymentSuccess(
                order.id,
                order.orderedById,
            );

            const orderForNotification = await this.orderRepository.findOne({
                where: { id: order.id },
                relations: ["orderedBy", "orderItems"],
            });
            if (orderForNotification) {
                void this.notificationService.notifyOrderPlaced(orderForNotification)
                    .catch((error) => console.error("Failed to send paid order notification:", error));
            }

            return order;
        } catch (err) {
            console.error("Failed to confirm order:", err);
            throw new APIError(500, "Failed to confirm order");
        }
    }

    private async initateEsewaPaymentForDraft(draft: CheckoutDraft) {
        const transaction_uuid = crypto.randomUUID();

        // Persist the uuid BEFORE contacting eSewa so the success callback
        // can always resolve back to this draft, even on retries.
        draft.esewaTransactionUuid = transaction_uuid;
        await this.checkoutDraftRepository.save(draft);

        const totalPrice = draft.totals?.totalPrice;

        const data = `total_amount=${totalPrice},transaction_uuid=${transaction_uuid},product_code=${config.ESEWA_MERCHANT}`;

        const esewaSignature = this.generateHmacSha256Hash(
            data,
            config.SECRET_KEY,
        );

        let paymentData = {
            amount: totalPrice,
            failure_url: `${config.FRONTEND_URL}/order/esewa-payment-failure?did=${draft.id}`,
            product_delivery_charge: "0",
            product_service_charge: "0",
            product_code: config.ESEWA_MERCHANT,
            signed_field_names: "total_amount,transaction_uuid,product_code",
            success_url: `${config.FRONTEND_URL}/order/esewa-payment-success?did=${draft.id}`,
            tax_amount: "0",
            total_amount: totalPrice,
            transaction_uuid: transaction_uuid,
            metadata: {
                draftId: draft.id,
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
                    throw new APIError(
                        400,
                        "Insufficient stock",
                        "INSUFFICIENT_STOCK",
                    );
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
                    "INSUFFICIENT_STOCK",
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

            // Atomically claim the promo's usage slot in the same transaction
            // that saves the order and reserves stock. If the slot is already
            // exhausted (a concurrent order won the race), the whole
            // transaction rolls back — no order, no stock deduction.
            if (savedOrder.appliedPromoCode) {
                const claimed = await this.claimPromoUsage(
                    savedOrder.appliedPromoCode,
                    manager,
                );
                if (!claimed) {
                    throw new APIError(
                        400,
                        "Promo code usage limit has been reached. Remove the promo code and try again.",
                    );
                }
            }

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
                withDeleted: true,
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
            // No .leftJoinAndSelect("variant.product", ...) here: Postgres
            // rejects `FOR UPDATE` combined with an outer join ("FOR UPDATE cannot
            // be applied to the nullable side of an outer join"), which made this
            // query throw for every variant-based product (and only variant
            // products — the plain product lock query below has no join). The
            // order item's own `.product` relation (loaded by the caller) covers
            // the product name needed for the error message below.
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

                if (variant.stock < item.quantity) {
                    throw new APIError(
                        400,
                        `Insufficient stock for variant "${variant.sku || variant.id}" of product "${item.product?.name || "Unknown"}". ` +
                            `Available: ${variant.stock}, Requested: ${item.quantity}`,
                        "INSUFFICIENT_STOCK",
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
                        "INSUFFICIENT_STOCK",
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
            withDeleted: true,
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
        } else {
            await this.restoreStock(order.orderItems);
            order.paymentStatus = PaymentStatus.UNPAID;
            order.status = OrderStatus.CANCELLED;
            order.deliveryStatus = DeliveryStatus.DELIVERY_FAILED;
            // Order never fulfilled — return the claimed promo slot.
            await this.releasePromoUsage(order.appliedPromoCode).catch((err) =>
                console.error("Failed to release promo usage:", err),
            );
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
            withDeleted: true,
        });

        if (!order) {
            throw new APIError(404, "Order not found");
        }

        const shouldRestoreStock =
            order.status !== OrderStatus.CANCELLED &&
            order.deliveryStatus !== DeliveryStatus.DELIVERY_FAILED;

        if (shouldRestoreStock) {
            await this.restoreStock(order.orderItems);
            // Order never fulfilled — return the claimed promo slot.
            await this.releasePromoUsage(order.appliedPromoCode).catch((err) =>
                console.error("Failed to release promo usage:", err),
            );
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
                "orderItems.product.deal",
                "orderItems.variant",
                "orderItems.vendor",
                "orderItems.vendor.district",
                "vendorShippings",
            ],
            order: { createdAt: "desc" },
            withDeleted: true,
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
            .leftJoinAndSelect("product.deal", "deal")
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
            .withDeleted()
            .getOne();

        // Handle case when order does not exist
        if (!order) {
            throw new APIError(404, "Order not found");
        }

        return order;
    }

    async getOrderById(orderId: number): Promise<SanitizedOrderFull> {
        const order = await this.orderRepository
            .createQueryBuilder("order")
            .leftJoinAndSelect("order.orderedBy", "orderedBy")
            .leftJoinAndSelect("order.shippingAddress", "shippingAddress")
            .leftJoinAndSelect("order.orderItems", "orderItems")
            .leftJoinAndSelect("orderItems.product", "product")
            .leftJoinAndSelect("product.deal", "deal")
            .leftJoinAndSelect("orderItems.vendor", "vendor")
            .leftJoinAndSelect("vendor.district", "district")
            .leftJoinAndSelect("orderItems.variant", "variant")
            .leftJoinAndSelect("order.vendorShippings", "vendorShippings")
            .where("order.id = :orderId", { orderId })
            .withDeleted()
            .getOne();

        if (!order) {
            throw new APIError(404, "Order not found");
        }

        return sanitizeOrderFull(order);
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
                status: OrderStatus.ORDER_PLACED,
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
            withDeleted: true,
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
            withDeleted: true,
        });

        // Throw error if no order is found
        if (!order) {
            throw new APIError(404, "Order not found");
        }

        // Return the found order with relations
        return sanitizeOrderFull(order);
    }

    /**
     * The single function permitted to write Order.status anywhere in the
     * codebase. Every other status-changing code path — the admin/staff
     * free-form endpoint, delivery.admin.service.ts's markAtWarehouse/
     * assignRider, delivery.rider.service.ts's markDelivered/
     * markDeliveryFailed, payment webhooks — calls this instead of
     * assigning order.status directly, so the permission check, audit
     * log, customer/vendor emails, in-app notification, and socket push
     * always happen together and never drift out of sync again.
     */
    async changeOrderStatus(
        orderId: number,
        targetStatus: OrderStatus,
        options: {
            actorRole: StatusActorRole;
            changedByUserId?: number;
            auditActorType?: AuditActorType;
            reason: string;
            note?: string;
            expectedCurrentStatus?: OrderStatus;
        },
    ): Promise<SanitizedOrderFull> {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderedBy",
                "shippingAddress",
                "orderItems",
                "orderItems.product",
                "orderItems.vendor",
                "orderItems.vendor.district",
                "orderItems.variant",
                "vendorShippings",
            ],
            withDeleted: true,
        });

        if (!order) {
            throw new APIError(404, "Order not found");
        }

        // Optimistic-concurrency guard: reject if the order moved since the
        // caller last read it (another admin, a rider, or a payment webhook).
        if (
            options.expectedCurrentStatus &&
            options.expectedCurrentStatus !== order.status
        ) {
            throw new OrderStateChangedError(
                `Order is currently ${order.status}, not ${options.expectedCurrentStatus}. Refresh and try again.`,
            );
        }

        const previousStatus = order.status;

        // Setting the same status again is a harmless no-op — match the
        // pre-existing behavior (frontend already disables the submit
        // button in this case) but skip every side effect below instead
        // of re-sending a "status changed" email/notification for
        // nothing changing.
        if (previousStatus === targetStatus) {
            return sanitizeOrderFull(order);
        }

        if (!canTransition(options.actorRole, previousStatus, targetStatus)) {
            throw new InvalidOrderStatusTransitionError(
                `${options.actorRole} cannot change order status from ${previousStatus} to ${targetStatus}.`,
            );
        }

        if (
            targetStatus === OrderStatus.ASSIGNED_TO_RIDER &&
            previousStatus !== OrderStatus.ARRIVED_AT_WAREHOUSE
        ) {
            throw new InvalidOrderStatusTransitionError(
                `Only orders with status ARRIVED_AT_WAREHOUSE can be assigned to a rider. Current status: ${previousStatus}.`,
            );
        }

        // COD orders are marked PAID the moment they're confirmed delivered.
        if (
            targetStatus === OrderStatus.DELIVERED &&
            order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY &&
            order.paymentStatus !== PaymentStatus.PAID
        ) {
            order.paymentStatus = PaymentStatus.PAID;
        }

        // Restock whenever an order lands in a terminal not-fulfilled state,
        // unless it was already in one (avoid double-crediting stock if an
        // admin bounces between CANCELLED/NOT_RECEIVED/RETURNED).
        const terminalUnfulfilled = [
            OrderStatus.CANCELLED,
            OrderStatus.NOT_RECEIVED,
            OrderStatus.RETURNED,
        ];
        if (
            terminalUnfulfilled.includes(targetStatus) &&
            !terminalUnfulfilled.includes(previousStatus)
        ) {
            // Order never fulfilled — return any claimed promo slot.
            await this.releasePromoUsage(order.appliedPromoCode).catch((err) =>
                console.error("Failed to release promo usage:", err),
            );
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

        order.status = targetStatus;
        await this.orderRepository.save(order);

        const changedByRole: OrderStatusChangedByRole =
            options.actorRole === "RIDER"
                ? OrderStatusChangedByRole.RIDER
                : options.actorRole === "SYSTEM"
                  ? OrderStatusChangedByRole.SYSTEM
                  : OrderStatusChangedByRole.ADMIN;

        await this.recordStatusChange(order.id, previousStatus, targetStatus, {
            reason: options.reason,
            note: options.note,
            changedByUserId: options.changedByUserId,
            changedByRole,
        });

        await auditService.record({
            module: "ORDER",
            action: "STATUS_CHANGED",
            entityType: "Order",
            entityId: order.id,
            actor: {
                type: options.auditActorType
                    ?? (options.actorRole === "SYSTEM"
                        ? AuditActorType.SYSTEM
                        : options.actorRole === "RIDER"
                          ? AuditActorType.RIDER
                          : AuditActorType.ADMIN),
                id: options.changedByUserId ?? null,
            },
            summary: `Order status changed from ${previousStatus} to ${targetStatus}`,
            before: { status: previousStatus },
            after: {
                status: targetStatus,
                reason: options.reason,
                note: options.note,
            },
        });

        const statusSideEffects: Array<() => Promise<void>> = [];

        if (order.orderedBy?.email) {
            statusSideEffects.push(async () => {
                try {
                    await sendOrderStatusEmail(
                        order.orderedBy!.email,
                        order.orderNumber,
                        order.status,
                    );
                } catch (error) {
                    console.error(
                        "Failed to send customer status email:",
                        error,
                    );
                }
            });
        }

        // ORDER_PLACED is covered by the order-placed email already sent at
        // checkout — every other transition gets a vendor notification.
        if (targetStatus !== OrderStatus.ORDER_PLACED) {
            const vendorEmails = [
                ...new Set(
                    order.orderItems
                        .filter((item) => item.vendorId && item.vendor?.email)
                        .map((item) => item.vendor.email),
                ),
            ];

            statusSideEffects.push(async () => {
                await Promise.all(
                    vendorEmails.map((email) =>
                        sendVendorOrderStatusEmail(
                            email,
                            order.orderNumber,
                            order.status,
                        ).catch((error) => {
                            console.error(
                                "Failed to send vendor status email:",
                                error,
                            );
                        }),
                    ),
                );
            });
        }

        if (targetStatus === OrderStatus.DELIVERED && config.USER_EMAIL) {
            statusSideEffects.push(async () => {
                try {
                    const deliveredEmailData =
                        await this.buildAdminOrderEmailData(order);
                    await sendAdminOrderDeliveredEmail(
                        config.USER_EMAIL!,
                        deliveredEmailData,
                    );
                } catch (error) {
                    console.error(
                        "Failed to send admin delivered email:",
                        error,
                    );
                }
            });
        }

        statusSideEffects.push(async () => {
            try {
                await this.notificationService.notifyOrderStatusUpdated(order);
            } catch (error) {
                console.error(
                    "Failed to send order status notification:",
                    error,
                );
            }
        });

        dispatchStatusSideEffects(statusSideEffects);

        emitOrderStatusUpdate(order);

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
     * Same timeline as getOrderStatusHistory, scoped to a vendor: throws if
     * the vendor has no items on this order, so a vendor can never read
     * another vendor's — or another customer's unrelated — order history.
     */
    async getOrderStatusHistoryForVendor(
        vendorId: number,
        orderId: number,
    ): Promise<OrderStatusHistory[]> {
        const hasAccess = await this.orderItemRepository.exists({
            where: { orderId, vendorId },
        });
        if (!hasAccess) {
            throw new APIError(
                404,
                "Order not found or you are not authorized to view it",
            );
        }
        return this.getOrderStatusHistory(orderId);
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
            withDeleted: true,
        });
        return order ? sanitizeOrderFull(order) : null;
    }

    /**
     * Get all orders that include products sold by a specific vendor,
     * with server-side search, status filtering, sorting, and pagination.
     *
     * @param {number} vendorId - The ID of the vendor.
     * @param {IVendorOrderQueryParams} params - Query parameters for filtering/sorting/paging.
     * @returns Paginated result with status counts for tab labels.
     * @access Vendor
     */
    /**
     * Shared filter/search builder for the vendor order list and its export
     * — an ID-only query (see getVendorOrders' step-1 comment for why),
     * with every status/search filter applied. Callers add sort + paging.
     */
    private buildVendorOrderIdQuery(
        vendorId: number,
        filters: Pick<IVendorOrderQueryParams, "status" | "search">,
    ) {
        const idQuery = this.orderRepository
            .createQueryBuilder("order")
            .innerJoin(
                "order.orderItems",
                "orderItems",
                "orderItems.vendorId = :vendorId",
                { vendorId },
            )
            .leftJoin("orderItems.product", "product")
            .leftJoin("order.orderedBy", "orderedBy")
            .select("order.id", "id");

        if (filters.status) {
            // Legacy tab values from before the 10-status unification map
            // onto the closest real status; anything else (a real status
            // value like "ASSIGNED_TO_RIDER") passes through unchanged.
            const statusMap: Record<string, string> = {
                delivered: "DELIVERED",
                pending: "ORDER_PLACED",
                canceled: "CANCELLED",
                cancelled: "CANCELLED",
            };
            const dbStatus =
                statusMap[filters.status.toLowerCase()] ??
                filters.status.toUpperCase();
            idQuery.andWhere("order.status = :status", { status: dbStatus });
        }

        if (filters.search?.trim()) {
            const search = `%${filters.search.trim()}%`;
            idQuery.andWhere(
                new Brackets((qb) => {
                    qb.where("order.orderNumber ILIKE :search")
                        .orWhere("orderedBy.fullName ILIKE :search")
                        .orWhere("orderedBy.username ILIKE :search")
                        .orWhere("orderedBy.email ILIKE :search")
                        .orWhere("orderedBy.phoneNumber ILIKE :search")
                        .orWhere("product.name ILIKE :search");
                }),
                { search },
            );
        }

        return idQuery;
    }

    private vendorOrderSortColumn(sort: IVendorOrderQueryParams["sort"]): {
        column: string;
        direction: "ASC" | "DESC";
    } {
        switch (sort) {
            case "oldest":
                return { column: "order.createdAt", direction: "ASC" };
            case "highestPrice":
                return {
                    column: "order.merchandiseSubtotal",
                    direction: "DESC",
                };
            case "lowestPrice":
                return {
                    column: "order.merchandiseSubtotal",
                    direction: "ASC",
                };
            case "newest":
            default:
                return { column: "order.createdAt", direction: "DESC" };
        }
    }

    /** Loads full relations for exactly the given order IDs and sanitizes
     * them for vendor viewing, preserving the caller's id order (SQL
     * `IN (...)` does not guarantee row order). Shared by the paginated
     * list and the unpaginated export. */
    private async loadVendorOrdersByIds(
        orderIds: number[],
        vendorId: number,
    ): Promise<SanitizedVendorOrderView[]> {
        if (orderIds.length === 0) return [];

        const orders = await this.orderRepository
            .createQueryBuilder("order")
            .leftJoinAndSelect("order.orderItems", "orderItems")
            .leftJoinAndSelect("order.orderedBy", "orderedBy")
            .leftJoinAndSelect("order.shippingAddress", "shippingAddress")
            .leftJoinAndSelect("orderItems.product", "product")
            .leftJoinAndSelect("orderItems.vendor", "vendor")
            .leftJoinAndSelect("vendor.district", "district")
            .leftJoinAndSelect("orderItems.variant", "variant")
            .leftJoinAndSelect("order.vendorShippings", "vendorShippings")
            .where("order.id IN (:...orderIds)", { orderIds })
            .getMany();

        const ordersById = new Map(orders.map((o) => [o.id, o]));
        return orderIds
            .map((id) => ordersById.get(id))
            .filter((o): o is Order => o !== undefined)
            .map((o) => sanitizeOrderForVendor(o, vendorId));
    }

    async getVendorOrders(
        vendorId: number,
        params: IVendorOrderQueryParams = {},
    ): Promise<{
        items: SanitizedVendorOrderView[];
        pagination: IPaginatedResult<SanitizedVendorOrderView>["pagination"];
    }> {
        const page = Math.max(1, Number(params.page) || 1);
        const limit = Math.min(100, Math.max(1, Number(params.limit) || 10));

        const idQuery = this.buildVendorOrderIdQuery(vendorId, params);
        const { column: sortColumn, direction: sortDirection } =
            this.vendorOrderSortColumn(params.sort);

        const totalItems = await idQuery.distinct(true).getCount();
        const totalPages = Math.max(1, Math.ceil(totalItems / limit));

        const idRows = await idQuery
            .distinct(true)
            .addSelect(sortColumn, "sortValue")
            .orderBy(sortColumn, sortDirection)
            .addOrderBy("order.id", sortDirection)
            .offset((page - 1) * limit)
            .limit(limit)
            .getRawMany<{ id: number }>();

        const items = await this.loadVendorOrdersByIds(
            idRows.map((r) => r.id),
            vendorId,
        );

        return {
            items,
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
     * Same filters as getVendorOrders but no pagination — every matching
     * row, for CSV/Excel export. The frontend's export buttons used to
     * build files from whatever page was currently displayed; this is the
     * single place that returns the *complete* filtered result set instead.
     */
    async getAllVendorOrdersForExport(
        vendorId: number,
        params: Pick<
            IVendorOrderQueryParams,
            "status" | "search" | "sort"
        > = {},
    ): Promise<SanitizedVendorOrderView[]> {
        const idQuery = this.buildVendorOrderIdQuery(vendorId, params);
        const { column: sortColumn, direction: sortDirection } =
            this.vendorOrderSortColumn(params.sort);

        const idRows = await idQuery
            .distinct(true)
            .addSelect(sortColumn, "sortValue")
            .orderBy(sortColumn, sortDirection)
            .addOrderBy("order.id", sortDirection)
            .getRawMany<{ id: number }>();

        return this.loadVendorOrdersByIds(
            idRows.map((r) => r.id),
            vendorId,
        );
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
        const orders = await this.orderRepository
            .createQueryBuilder("order")
            .leftJoinAndSelect("order.orderItems", "orderItems")
            .leftJoinAndSelect("orderItems.product", "product")
            .leftJoinAndSelect("orderItems.variant", "variant")
            .leftJoinAndSelect("orderItems.vendor", "vendor")
            .leftJoinAndSelect("vendor.district", "district")
            .leftJoinAndSelect("order.shippingAddress", "shippingAddress")
            .leftJoinAndSelect("order.vendorShippings", "vendorShippings")
            .where("order.orderedById = :userId", { userId })
            .orderBy("order.createdAt", "DESC")
            .withDeleted()
            .getMany();

        return orders.map(sanitizeOrderFull);
    }

    async getOrderDetailByMerchantTransactionId(
        mTransactionId: string,
        opts?: { returnedFromGateway?: boolean },
    ): Promise<Order | null> {
        const order = await this.orderRepository.findOne({
            where: {
                mTransactionId: mTransactionId,
            },
        });
        if (order) return order;

        // Deferred-order flow: the transaction belongs to a checkout draft.
        // The gateway is the source of truth — query it and settle the draft
        // so the existing Transaction.tsx polling contract keeps working
        // (pending → keep polling, cancelled → show cancelled).
        const draft = await this.checkoutDraftRepository.findOne({
            where: { mTransactionId },
        });
        if (!draft) return null;

        if (draft.status === CheckoutDraftStatus.COMPLETED && draft.orderId) {
            return (
                (await this.orderRepository.findOne({
                    where: { id: draft.orderId },
                })) ?? null
            );
        }

        if (draft.status === CheckoutDraftStatus.PENDING) {
            // TTL elapsed without a gateway verdict — the session is over.
            if (draft.expiresAt && draft.expiresAt <= new Date()) {
                await this.checkoutDraftRepository.update(
                    { id: draft.id, status: CheckoutDraftStatus.PENDING },
                    { status: CheckoutDraftStatus.EXPIRED },
                );
                draft.status = CheckoutDraftStatus.EXPIRED;
                return this.buildDraftOrderView(
                    draft,
                    PaymentStatus.UNPAID,
                    OrderStatus.CANCELLED,
                );
            }

            const { status } =
                await this.npsPaymentService.checkTransactionStatus(
                    mTransactionId,
                );

            if (status === "Success") {
                try {
                    return await this.materializeDraftOrder(
                        draft,
                        mTransactionId,
                    );
                } catch (error) {
                    // Money-without-order reconciliation case — already
                    // logged loudly inside materializeDraftOrder. Keep the
                    // UI on a pending view instead of a hard failure.
                    console.error(
                        "[CHECKOUT-DRAFT] materialization failed during status lookup:",
                        error instanceof Error ? error.message : error,
                    );
                }
            } else if (status === "Failed") {
                await this.cancelCheckoutDraft(
                    draft,
                    "Gateway reported failure",
                );
                return this.buildDraftOrderView(
                    draft,
                    PaymentStatus.UNPAID,
                    OrderStatus.CANCELLED,
                );
            } else if (opts?.returnedFromGateway) {
                // The customer's browser already completed the gateway
                // round-trip (the redirect back to the app) without a
                // success verdict — i.e. they cancelled, closed the gateway
                // or the gateway timed out. NPS still reports the txn as
                // pending/initiated in that case, so without this branch
                // the page would poll a misleading "Payment Pending" view
                // until the 2h TTL. Settle it as cancelled now.
                await this.cancelCheckoutDraft(
                    draft,
                    "User returned from gateway without a successful payment",
                );
                return this.buildDraftOrderView(
                    draft,
                    PaymentStatus.UNPAID,
                    OrderStatus.CANCELLED,
                );
            }

            // Pending / Unknown while the customer is still at the gateway
            // → keep the client polling.
            return this.buildDraftOrderView(
                draft,
                PaymentStatus.UNPAID,
                OrderStatus.ORDER_PLACED,
            );
        }

        // CANCELLED / EXPIRED draft — no order exists or will exist.
        return this.buildDraftOrderView(
            draft,
            PaymentStatus.UNPAID,
            OrderStatus.CANCELLED,
        );
    }

    async deleteOrder() {
        const order = await this.orderRepository.delete({});
    }
}
