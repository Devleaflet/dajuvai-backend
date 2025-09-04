import { Not, Repository } from 'typeorm';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';
import { IShippingAddressRequest, IUpdateOrderStatusRequest, IOrderCreateRequest } from '../interface/order.interface';
import { Order, OrderStatus, PaymentStatus, PaymentMethod } from '../entities/order.entity';
import { Address } from '../entities/address.entity';
import { OrderItem } from '../entities/orderItems.entity';
import { Cart } from '../entities/cart.entity';
import { CartItem } from '../entities/cartItem.entity';
import { User } from '../entities/user.entity';
import { CartService } from './cart.service';
import { PaymentService } from './payment.service';
import { District } from '../entities/district.entity';
import { Product } from '../entities/product.entity';
import { PromoService } from './promo.service';
import { DiscountType, InventoryStatus } from '../entities/product.enum';
import { Variant } from '../entities/variant.entity';
import { findUserById } from './user.service';
import { sendOrderStatusEmail } from '../utils/nodemailer.utils';
import { add } from 'winston';
import crypto from 'crypto';
import axios from 'axios';
import 'dotenv/config';


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
    private cartRepository: Repository<Cart>;
    private userRepository: Repository<User>;
    private cartService: CartService;
    private paymentService: PaymentService;
    private districtRepository: Repository<District>;
    private productRepository: Repository<Product>;
    private promoService: PromoService;
    private variantRepository: Repository<Variant>;


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

        this.variantRepository = AppDataSource.getTreeRepository(Variant);
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
            relations: ['address'], // Include associated address in the query result
        });

        // Throw an error if user is not found in the database
        if (!user) throw new APIError(404, 'User not found');

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
            relations: ['items', 'items.product', 'items.product.vendor', 'items.product.vendor.district', 'items.variant'],
        });

        // If cart not found or cart has no items, throw an error indicating cart is empty
        if (!cart || !cart.items.length) throw new APIError(400, 'Cart is empty');

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
        // Attempt to find the district by its name
        const district = await this.districtRepository.findOne({ where: { name: districtName } });

        // If the district does not exist, throw an error
        if (!district) throw new APIError(400, 'Invalid district');

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
        user: User
    ): Promise<Address> {

        let address = await this.addressRepository.findOne({ where: { userId } });

        if (address) {
            if (
                address.province !== shippingAddress.province ||
                address.district !== shippingAddress.district ||
                address.city !== shippingAddress.city ||
                address.localAddress !== shippingAddress.streetAddress ||
                address.landmark !== shippingAddress.landmark
            ) {
                address.province = shippingAddress.province;
                address.district = shippingAddress.district;
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
            city: shippingAddress.city,
            localAddress: shippingAddress.streetAddress,
            landmark: shippingAddress.landmark,
            // phoneNumber,
            userId
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
        return items.map(item => {
            const price = item.variant
                ? item.variant.basePrice
                : item.product.basePrice;

            return this.orderItemRepository.create({
                productId: item.product.id,
                quantity: item.quantity,
                price,
                vendorId: item.product.vendorId,
                variantId: item.variant ? item.variant.id : null,
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
        shippingFee: number,
        orderData: IOrderCreateRequest
    ): Promise<Order> {
        // Convert items into OrderItem entities
        const orderItems = this.createOrderItems(items);

        // Calculate subtotal from items
        const subtotal = items.reduce((sum, item) => {
            let basePrice = 0;
            if(item.variant){
                basePrice  += item.variant.basePrice;
            }else{
                if(item.product?.discount && item.product?.discount > 0){
                    if(item.product?.discountType === DiscountType.PERCENTAGE){

                        basePrice += item.product.basePrice - (item.product.basePrice * (item.product.discount/100));
                    }else{
                        basePrice += item.product.basePrice - item.product.discount;
                    }
                }else{
                    basePrice += item.product.basePrice;
                }
            }
            // const basePrice = item.variant ? item.variant.basePrice : item.product.basePrice;
            return sum + (basePrice * item.quantity);
        }, 0);
        console.log("--------------subtotal------------------");
        console.log(subtotal);

        // apply promo code if provided
        let discountAmount = 0;
        let appliedPromoCode: string | null = null;

        if (orderData.promoCode) {
            const promo = await this.promoService.findPromoByCode(orderData.promoCode);
            if (!promo) {
                throw new APIError(400, 'Invalid or expired promo code');
            }
            discountAmount = (subtotal * promo.discountPercentage) / 100;
            console.log(promo)
            console.log("Promo applied successfully")
            appliedPromoCode = promo.promoCode;
        }

        const totalPrice = subtotal - discountAmount + shippingFee;

        return this.orderRepository.create({
            orderedById: userId,
            orderedBy: user,
            totalPrice,
            shippingFee,
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
            orderItems,
            isBuyNow: Boolean(isBuyNow),
            phoneNumber: orderData.phoneNumber,
        });
    }

    

    async checkAvailablePromocode(promoCode: string){
        const promo = await this.promoService.findPromoByCode(promoCode);
        if (!promo){
            return null;
        }
        return promo;
    }



    async trackOrder(email: string, orderId: number) {
        const order = await this.orderRepository.findOne({
            where: {
                id: orderId,
                orderedBy: { email }
            },
            relations: ["orderedBy"],
            select: ["id", "status"]
        })

        if (!order) {
            throw new APIError(404, "Order does not exist or does not belong to the user");
        }

        return order;
    }


    /**
     * Create a new order for a customer.
     *
     * @param {number} userId - ID of the user placing the order.
     * @param {IOrderCreateRequest} orderData - Payload containing shipping address and payment method.
     * @returns {Promise<{ order: Order; redirectUrl?: string }>} - Returns the created order and optional redirect URL for online payment.
     * @access Customer
     */
    // async createOrder(
    //     userId: number,
    //     orderData: IOrderCreateRequest
    // ): Promise<{ order: Order; redirectUrl?: string }> {
    //     try {
    //         const { shippingAddress, paymentMethod, phoneNumber } = orderData;

    //         console.log(shippingAddress);

    //         // Fetch user, cart, and shipping district in parallel
    //         const [user, cart, _district] = await Promise.all([
    //             this.getUser(userId),                                  // Get user and their saved address
    //             this.getCart(userId),                                  // Get cart with populated product and vendor info
    //             this.getDistrict(shippingAddress.district),            // Validate if district exists in system
    //         ]);

    //         // Check stock before creating the order
    //         for (const item of cart.items) {
    //             // If the cart item has a variant
    //             if (item.variantId) {
    //                 const variant = await this.variantRepository.findOne({
    //                     where: { id: item.variantId.toString() },
    //                 });

    //                 if (!variant) {
    //                     throw new APIError(404, `Variant not found for product: ${item.product.name}`);
    //                 }

    //                 if (variant.stock < item.quantity) {
    //                     throw new APIError(400, `Insufficient stock for variant of product: ${item.product.name}`);
    //                 }
    //             } else {
    //                 // Fallback to product-level stock if no variant
    //                 const product = await this.productRepository.findOne({
    //                     where: { id: item.product.id },
    //                 });

    //                 if (!product) {
    //                     throw new APIError(404, `Product not found for cart item ID: ${item.id}`);
    //                 }

    //                 if (!product.stock || product.stock < item.quantity) {
    //                     throw new APIError(400, `Insufficient stock for product: ${product.name}`);
    //                 }
    //             }
    //         }



    //         // Either fetch user's existing address or create a new one based on input
    //         const address = await this.getOrCreateAddress(userId, shippingAddress, user);

    //         // Calculate total shipping fee based on cart items and destination address
    //         const shippingFee = await this.calculateShippingFee(address, userId, cart.items);

    //         // Create the Order entity (not yet saved in DB)
    //         let order = await this.createOrderEntity(userId, user, cart, address, shippingFee, orderData);
    //         console.log(order);

    //         let redirectUrl: string | undefined;

    //         // Handle different payment methods
    //         if (paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
    //             // Save order directly for COD
    //             order = await this.orderRepository.save(order);


    //             for (const item of order.orderItems) {
    //                 if (item.variantId) {
    //                     const variant = await this.variantRepository.findOne({
    //                         where: { id: item.variantId.toString() },
    //                     });

    //                     if (!variant) {
    //                         throw new APIError(404, `Variant not found for order item ID: ${item.id}`);
    //                     }

    //                     if (variant.stock < item.quantity) {
    //                         throw new APIError(400, `Insufficient stock for variant of product ${item.product.name}`);
    //                     }

    //                     variant.stock -= item.quantity;

    //                     if (variant.stock <= 0) {
    //                         variant.status = InventoryStatus.OUT_OF_STOCK;
    //                     } else if (variant.stock < 5) {
    //                         variant.status = InventoryStatus.LOW_STOCK;
    //                     } else {
    //                         variant.status = InventoryStatus.AVAILABLE;
    //                     }

    //                     await this.variantRepository.save(variant);

    //                 } else {
    //                     const product = await this.productRepository.findOne({
    //                         where: { id: item.product.id },
    //                     });

    //                     if (!product) {
    //                         throw new APIError(404, `Product not found for order item ID: ${item.id}`);
    //                     }

    //                     if (!product.stock || product.stock < item.quantity) {
    //                         throw new APIError(400, `Insufficient stock for product ${product.name}`);
    //                     }

    //                     product.stock -= item.quantity;

    //                     if (product.stock <= 0) {
    //                         product.status = InventoryStatus.OUT_OF_STOCK;
    //                     } else if (product.stock < 5) {
    //                         product.status = InventoryStatus.LOW_STOCK;
    //                     } else {
    //                         product.status = InventoryStatus.AVAILABLE;
    //                     }

    //                     await this.productRepository.save(product);
    //                 }
    //             }


    //             await this.cartService.clearCart(userId);
    //         } else if (
    //             paymentMethod === PaymentMethod.ONLINE_PAYMENT ||
    //             paymentMethod === PaymentMethod.ESEWA ||
    //             paymentMethod === PaymentMethod.KHALIT
    //         ) {
    //             // Save order first before initiating online payment
    //             order = await this.orderRepository.save(order);
    //             console.log(order);
    //         } else {
    //             // Invalid payment method fallback
    //             throw new APIError(400, 'Invalid payment method');
    //         }

    //         return { order, redirectUrl };

    //     } catch (error) {
    //         // Wrap unexpected errors in a generic 500 API error
    //         console.log(error)
    //         throw error instanceof APIError ? error : new APIError(500, 'Failed to create order');
    //     }
    // }

    async updateUserDetail(id: number, fullName: string, phoneNumber: string) {
        const userDb = AppDataSource.getRepository(User);

        // Fetch the user first
        const user = await userDb.findOne({ where: { id: id } });
        if (!user) {
            throw new Error('User not found');
        }

        // Update the fields
        user.fullName = fullName;
        user.phoneNumber = phoneNumber;

        // Save changes
        const updatedUser = await userDb.save(user);

        console.log("--------------updated user------------------")

        console.log(updatedUser);
    }



    // async createOrder(
    //     userId: number,
    //     orderData: IOrderCreateRequest
    // ): Promise<{ order: Order; redirectUrl?: string }> {
    //     try {
    //         const { shippingAddress, paymentMethod, phoneNumber, fullName, productId, isBuyNow, variantId, quantity = 1 } = orderData;

    //         console.log("-----------------Order data-------------------")
    //         console.log(orderData);

    //         await this.updateUserDetail(userId, fullName, phoneNumber);

    //         console.log(shippingAddress);

    //         // Fetch user, cart, and shipping district in parallel
    //         const [user, cart, _district] = await Promise.all([
    //             this.getUser(userId),
    //             this.getCart(userId),
    //             this.getDistrict(shippingAddress.district),
    //         ]);

    //         console.log("----------------cart-------------------")
    //         console.log(cart.items)

    //         let items: any[];

    //         // Check stock before creating the order
    //         await this.validateStock(cart.items);

    //         // Either fetch user's existing address or create a new one based on input
    //         const address = await this.getOrCreateAddress(userId, shippingAddress, phoneNumber, user);

    //         // Calculate total shipping fee based on cart items and destination address
    //         const shippingFee = await this.calculateShippingFee(address, userId, cart.items);

    //         // Create the Order entity (not yet saved in DB)
    //         let order = await this.createOrderEntity(userId, user, cart, address, shippingFee, orderData);
    //         console.log(order);

    //         let redirectUrl: string | undefined;

    //         // Handle different payment methods
    //         if (paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
    //             // Save order directly for COD
    //             order = await this.orderRepository.save(order);

    //             // Reload the order with relations
    //             order = await this.orderRepository.findOne({
    //                 where: { id: order.id },
    //                 relations: ["orderItems", "orderItems.product", "orderItems.variant"],
    //             });

    //             console.log("----------------Order console-----------------------")
    //             console.log(order)

    //             // Update stock after successful order creation
    //             await this.updateStock(order.orderItems);
    //             await this.cartService.clearCart(userId);

    //         } else if (
    //             paymentMethod === PaymentMethod.ONLINE_PAYMENT ||
    //             paymentMethod === PaymentMethod.ESEWA ||
    //             paymentMethod === PaymentMethod.KHALIT
    //         ) {
    //             // Save order first before initiating online payment
    //             order = await this.orderRepository.save(order);
    //             console.log(order);
    //         } else {
    //             // Invalid payment method fallback
    //             throw new APIError(400, 'Invalid payment method');
    //         }

    //         return { order, redirectUrl };

    //     } catch (error) {
    //         // Wrap unexpected errors in a generic 500 API error
    //         console.log(error)
    //         throw error instanceof APIError ? error : new APIError(500, 'Failed to create order');
    //     }
    // }

    async createOrder(
        userId: number,
        orderData: IOrderCreateRequest
    ): Promise<{ order: Order; redirectUrl?: string, vendorids: any[], useremail: string, esewaRedirectUrl: string | undefined }> {
        try {
            const { shippingAddress, paymentMethod, phoneNumber, fullName, productId, isBuyNow, variantId, quantity } = orderData;

            console.log("-----------------Order data-------------------")
            console.log(orderData);

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

                console.log("------------------Product------------------")
                console.log(product)

                if (!product) throw new APIError(404, "Product not found");

                let variant = null;
                if (variantId) {
                    variant = await this.variantRepository.findOne({ where: { id: variantId } });
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

            console.log("----------------items-------------------")
            console.log(items);

            // Check stock before creating the order
            await this.validateStock(items);

            // Either fetch user's existing address or create a new one based on input
            const address = await this.getOrCreateAddress(userId, shippingAddress, user);

            console.log("-----------saved address----------------")
            console.log(address)

            // Calculate total shipping fee based on items and destination address
            const shippingFee = await this.calculateShippingFee(address, userId, items);

            const vendorids = shippingFee.vendorIds;

            const userDetail = await findUserById(userId);

            const useremail = userDetail.email


            // Create the Order entity (not yet saved in DB)
            let order = await this.createOrderEntity(userId, isBuyNow, user, items, address, shippingFee.shippingFee, orderData);
            console.log(order);

            // let redirectUrl: string | undefined;
            let esewaRedirectUrl;
            // Handle different payment methods
            if (paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
                order = await this.orderRepository.save(order);

                order = await this.orderRepository.findOne({
                    where: { id: order.id },
                    relations: ["orderItems", "orderItems.product", "orderItems.variant"],
                });

                console.log(order.orderItems);

                await this.updateStock(order.orderItems);

                // 🔹 Only clear cart if it's not Buy Now
                if (!isBuyNow) {
                    await this.cartService.clearCart(userId);
                }

            } else if (
                paymentMethod === PaymentMethod.ONLINE_PAYMENT ||
                paymentMethod === PaymentMethod.ESEWA ||
                paymentMethod === PaymentMethod.KHALIT
            ) {
                console.log("------------Order saving after payment is initated for online payment-------- ")
                // Save order first before initiating online payment
                order = await this.orderRepository.save(order);
                if (paymentMethod === PaymentMethod.ESEWA) {

                    esewaRedirectUrl = await this.initateEsewaPayment(order);
                    console.log("Respose of Esewa", esewaRedirectUrl)
                }
            } else {
                throw new APIError(400, "Invalid payment method");
            }

            return { order, esewaRedirectUrl, vendorids, useremail };

        } catch (error) {
            console.log(error);
            throw error instanceof APIError ? error : new APIError(500, "Failed to create order");
        }
    }

    async esewaSuccess(token: string, orderId: number) {
        try {
            let object = JSON.parse(Buffer.from(token, "base64").toString("ascii"))
            console.log("This is the object after decoding", object)
            if (object.status === "COMPLETE") {
                // order success
                const updateOrderId = await this.orderSuccess(orderId, object.transaction_uuid);

                let order = await this.orderRepository.findOne({
                    where: { id: orderId },
                    relations: ["orderedBy"]
                })

                if (!order) {
                    throw new APIError(404, `Order with ID ${orderId} not found`);
                }
                
                // cart clear
                if (order && !order.isBuyNow) {
                    await this.cartService.clearCart(order.orderedById)
                }

                // payment status changed to PAID
                order.paymentStatus = PaymentStatus.PAID;

                // order status changes to confirmed
                order.status = OrderStatus.CONFIRMED;

                // save order details
                await this.orderRepository.save(order);

            }
            return { success: true }
        } catch (err) {
            console.log("Error", err)
            throw new APIError(500, 'Esewa payment verification failed');
        }
    }

    async esewaFailed(orderId: number) {
        try {
            const order = await this.orderRepository.findOne({ where: { id: orderId } });
            if (!order) {
                throw new APIError(404, "Order not found");
            }

            // Update order status
            order.status = OrderStatus.CANCELLED;
            await this.orderRepository.save(order);
            return { success: true }
        } catch (err) {
            console.log("Error", err)
            throw new APIError(500, 'Esewa payment verification failed');
        }
    }

    async orderSuccess(orderId: number, transactionId: string) {
        try {
            const order = await this.orderRepository.findOne({ where: { id: orderId } });
            if (!order) {
                throw new APIError(404, "Order not found");
            }

            // Update order status and transaction ID
            order.status = OrderStatus.CONFIRMED;
            order.paymentStatus = PaymentStatus.PAID;
            order.mTransactionId = transactionId;
            await this.orderRepository.save(order);

            return order;
        } catch (err) {
            console.log(err)
            throw new APIError(500, "Failed to confirm order");
        }
    }


    private async initateEsewaPayment(order: Order) {
        console.log("------------Order to Initiate Esewa payment-------------")
        console.log(order)
        const transaction_uuid = crypto.randomUUID();

        const data = `total_amount=${order.totalPrice},transaction_uuid=${transaction_uuid},product_code=${process.env.ESEWA_MERCHANT}`;

        console.log("-------------Data after order---------------------")
        console.log(data)
        console.log("----------------------------------")

        const esewaSignature = this.generateHmacSha256Hash(data, process.env.SECRET_KEY);

        let paymentData = {
            amount: order.totalPrice,
            failure_url: `${process.env.FRONTEND_URL}/order/esewa-payment-failure?oid=${order?.id}`,
            // failure_url: `${process.env.FRONTEND_URL}/order/esewa-payment-failure&oid=${order?.id}`,
            product_delivery_charge: "0",
            product_service_charge: "0",
            product_code: process.env.ESEWA_MERCHANT,
            signed_field_names: "total_amount,transaction_uuid,product_code",
            success_url: `${process.env.FRONTEND_URL}/order/esewa-payment-success?oid=${order?.id}`,
            // success_url: `${process.env.FRONTEND_URL}/order/esewa-payment-success&oid=${order?.id}`,
            // success_url: `${process.env.FRONTEND_URL}/order/esewa-payment-success`,
            tax_amount: "0",
            total_amount: order?.totalPrice,
            transaction_uuid: transaction_uuid,
            metadata: {
                paymentId: order?.id,
            },
            signature: esewaSignature
        };


        try {
            const paymentResponse = await axios.post(process.env.ESEWA_PAYMENT_URL, null, {
                params: paymentData,
            });
            const reqPayment = JSON.parse(this.safeStringify(paymentResponse));
            if (reqPayment.status === 200 && reqPayment.request?.res?.responseUrl) {
                console.log("---------re payment responseurl ")
                console.log(reqPayment.request.res.responseUrl)
                return {
                    url: reqPayment.request.res.responseUrl
                };
            } else {
                throw new Error('Esewa payment initiation failed');
            }
        } catch (error) {
            console.error('Esewa payment error:', error);
            throw new APIError(500, 'Esewa payment initiation failed');
        }
    }

    private generateHmacSha256Hash(data: string, secret: string) {
        console.log("Generated Hash")
        console.log("data", data)
        console.log("Secret", secret)
        if (!data || !secret) {
            throw new Error("Both data and secret are required to generate a hash.");
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
        for (const item of cartItems) {

            console.log("------------this is a items for debugging----------------")
            console.log(item)
            if (item.variant) {
                const variant = await this.variantRepository.findOne({
                    where: { id: item.variant.id },
                });

                console.log("----------Variant-------------------")
                console.log(variant.stock)
                console.log(item.quantity)

                if (!variant) {
                    throw new APIError(404, `Variant not found for product: ${item.product.name}`);
                }

                if (variant.stock < item.quantity) {

                    console.log(`Insufficient stock for variant "${variant.sku || 'N/A'}" of product "${item.product.name}". ` +
                        `Available: ${variant.stock}, Requested: ${item.quantity}`)

                    throw new APIError(400, "Insufficient stock");
                }

                continue;
            }
            // Fallback to product-level stock if no variant
            const product = await this.productRepository.findOne({
                where: { id: item.product.id },
            });

            console.log("------------------Products----------------------")
            console.log(product)
            console.log(product.stock)
            console.log(item.quantity)

            if (!product) {
                throw new APIError(404, `Product not found for cart item ID: ${item.id}`);
            }

            if (!product.stock || product.stock < item.quantity) {
                throw new APIError(400,
                    `Insufficient stock for product "${product.name}". ` +
                    `Available: ${product.stock || 0}, Requested: ${item.quantity}`
                );
            }

        }
    }

    // Separate method for stock updates
    private async updateStock(orderItems: any[]): Promise<void> {
        for (const item of orderItems) {
            // --- Handle Variant Stock ---
            if (item.variantId) {
                const variant = await this.variantRepository.findOne({
                    where: { id: item.variantId },
                    relations: ["product"],
                });

                if (!variant) {
                    throw new APIError(404, `Variant not found for order item ID: ${item.id}`);
                }

                // Double-check stock
                if (variant.stock < item.quantity) {
                    throw new APIError(
                        400,
                        `Insufficient stock for variant "${variant.sku || variant.id}" of product "${variant.product?.name || "Unknown"}". ` +
                        `Available: ${variant.stock}, Requested: ${item.quantity}`
                    );
                }

                // Deduct stock
                variant.stock -= item.quantity;

                variant.status = variant.stock <= 0
                    ? InventoryStatus.OUT_OF_STOCK
                    : variant.stock < 5
                        ? InventoryStatus.LOW_STOCK
                        : InventoryStatus.AVAILABLE;

                await this.variantRepository.save(variant);

                // remove variant from other users cart if stock is zero
                if (variant.stock <= 0) {
                    await this.removeItemFromCarts(item.variantId, true)
                }

            }
            // --- Handle Product Stock for non variant product---
            else if (item.productId) {
                const product = await this.productRepository.findOne({
                    where: { id: item.productId },
                });

                if (!product) {
                    throw new APIError(404, `Product not found for order item ID: ${item.id}`);
                }

                // Double-check stock
                if (!product.stock || product.stock < item.quantity) {
                    throw new APIError(
                        400,
                        `Insufficient stock for product "${product.name || product.id}". ` +
                        `Available: ${product.stock || 0}, Requested: ${item.quantity}`
                    );
                }

                // Deduct stock
                product.stock -= item.quantity;
                product.status = product.stock <= 0
                    ? InventoryStatus.OUT_OF_STOCK
                    : product.stock < 5
                        ? InventoryStatus.LOW_STOCK
                        : InventoryStatus.AVAILABLE;

                await this.productRepository.save(product);

                if (product.stock <= 0) {
                    await this.removeItemFromCarts(item.productId, false)
                }

            }
            // --- Invalid Order Item ---
            else {
                throw new APIError(400, `Order item ID: ${item.id} has neither productId nor variantId`);
            }
        }
    }


    private async removeItemFromCarts(itemId: string | number, isvariant: boolean) {
        const cartItemRepo = AppDataSource.getRepository(CartItem);

        if (isvariant) {
            await cartItemRepo.delete({ variantId: Number(itemId) })
        } else {
            await cartItemRepo.delete({ product: { id: Number(itemId) } })
        }
    }



    /**
     * Verify payment for an order and update its status accordingly.
     *
     * @param {number} orderId - ID of the order to verify.
     * @param {string} transactionId - Transaction ID returned by the payment gateway.
     * @param {any} responseData - Full response payload received from the payment gateway.
     * @returns {Promise<Order>} - Returns the updated order after verification.
     * @access Public (called via payment success webhook or redirect handler)
     */
    async verifyPayment(orderId: number, transactionId: string, responseData: any): Promise<Order> {
        // Fetch order by ID and transaction ID, including all required relations
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                'orderedBy',
                'shippingAddress',
                'orderItems',
                'orderItems.product',
                'orderItems.vendor',
            ],
        });

        // If order doesn't exist, throw a 404 error
        if (!order) {
            throw new APIError(404, 'Order not found');
        }

        // Verify payment status using external payment service (e.g., Esewa/Khalti)
        const isSuccessful = await this.paymentService.verifyPayment(
            transactionId,
            orderId.toString(),
            responseData
        );

        // Update payment and order status based on verification result
        order.paymentStatus = isSuccessful ? PaymentStatus.PAID : PaymentStatus.UNPAID;
        order.status = isSuccessful ? OrderStatus.CONFIRMED : OrderStatus.PENDING;

        // Store full payment gateway response for auditing/debugging
        // order.gatewayResponse = JSON.stringify(responseData);

        // Save updated order info
        await this.orderRepository.save(order);

        if (isSuccessful) {
            // Clear cart after successful payment (currently clears only first item, can be extended)
            await this.cartService.removeFromCart(order.orderedById, {
                cartItemId: order.orderItems[0].id,
            });
        }

        // Return updated order
        return order;
    }




    /**
     * Handle payment cancellation scenario by marking the order as UNPAID.
     *
     * @param {number} orderId - ID of the order for which the payment was cancelled.
     * @returns {Promise<void>} - Resolves once the order is updated.
     * @access Public (called when a user cancels payment)
     */
    async handlePaymentCancel(orderId: number): Promise<void> {
        // Find the order by ID
        const order = await this.orderRepository.findOne({ where: { id: orderId } });

        // If order does not exist, throw 404
        if (!order) {
            throw new APIError(404, 'Order not found');
        }

        // Mark the order's payment status as UNPAID due to cancellation
        order.paymentStatus = PaymentStatus.UNPAID;

        // Save updated status to database
        await this.orderRepository.save(order);
    }




    /**
     * Calculates the total shipping fee based on the shipping address and vendor districts.
     * 
     * @param {Address} shippingAddress - The user's provided shipping address.
     * @param {number} userId - ID of the user placing the order.
     * @param {CartItem[]} cartItems - List of cart items associated with the order.
     * @returns {Promise<number>} - The total calculated shipping fee.
     * @access Internal (used during order creation)
     */
    private async calculateShippingFee(
        shippingAddress: Address,
        userId: number,
        cartItems: CartItem[]
    ): Promise<{ shippingFee: number; vendorIds: number[] }> {

        if (!shippingAddress) {
            throw new APIError(400, "Shipping address is missing");
        }

        // Track unique vendor districts and vendor IDs
        const vendorDistrictSet = new Set<string>();
        const vendorIdsSet = new Set<number>();

        for (const item of cartItems) {
            const vendor = item.product?.vendor;

            if (!vendor || !vendor.district || !vendor.district.name) {
                throw new APIError(400, `Vendor for product ${item.product.id} has no valid address`);
            }

            vendorDistrictSet.add(vendor.district.name);
            vendorIdsSet.add(vendor.id);
        }

        // User district
        const userDistrict = shippingAddress.district;

        // Districts treated as same metro area
        const sameDistrictGroup = ['Kathmandu', 'Bhaktapur', 'Lalitpur'];

        let shippingFee = 0;

        // Calculate fee per unique vendor district
        for (const vendorDistrict of vendorDistrictSet) {
            const isSameCity =
                userDistrict === vendorDistrict ||
                (sameDistrictGroup.includes(userDistrict) && sameDistrictGroup.includes(vendorDistrict));

            shippingFee += isSameCity ? 100 : 200;
        }

        return {
            shippingFee,
            vendorIds: Array.from(vendorIdsSet),
        };
    }




    /**
     * Fetches all customer orders from the database.
     * 
     * @returns {Promise<Order[]>} - A list of all orders with user, items, and shipping address populated.
     * @access Admin
     */
    async getCustomerOrders(): Promise<Order[]> {
        return this.orderRepository.find({
            relations: ['orderedBy', 'orderItems', 'shippingAddress', 'orderItems.product', 'orderItems.variant'],
            where: {
                status: Not(OrderStatus.PENDING)
            },
            order: { createdAt: "desc" }
        })
    };




    /**
     * Fetch a single order's detailed information by its ID.
     * 
     * @param {number} orderId - The ID of the order to retrieve.
     * @returns {Promise<Order>} - The complete order with user, shipping address, products, and vendors included.
     * @throws {APIError} - Throws 404 error if the order is not found.
     * @access Admin | Customer (based on controller-level auth)
     */
    async getCustomerOrderDetails(orderId: number): Promise<Order> {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },

            // Load related entities: customer, address, products, variant, and vendor info
            relations: [
                'orderedBy',
                'shippingAddress',
                'orderItems',
                'orderItems.product',
                'orderItems.vendor',
                'orderItems.variant'
            ],
        });

        // Handle case when order does not exist
        if (!order) {
            throw new APIError(404, 'Order not found');
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
        addressData: IShippingAddressRequest
    ): Promise<Order> {
        // Find the pending order by orderId and userId
        const order = await this.orderRepository.findOne({
            where: {
                id: orderId,
                orderedById: userId,
                status: OrderStatus.PENDING,
            },
            relations: ['orderedBy'],
        });

        // If order not found or status not PENDING, throw 404
        if (!order) {
            throw new APIError(404, 'Order not found');
        }

        // Find existing address associated with the user (if any)
        let shippingAddress = await this.addressRepository.findOne({ where: { userId } });

        if (shippingAddress) {
            // Merge new address data into existing address entity
            this.addressRepository.merge(shippingAddress, addressData);

            // Save updated address to DB
            shippingAddress = await this.addressRepository.save(shippingAddress);
        } else {
            // No existing address: create a new one with userId attached
            shippingAddress = this.addressRepository.create({ ...addressData, userId });

            // Save new address entity to DB
            shippingAddress = await this.addressRepository.save(shippingAddress);
        }

        // Update order's shipping address reference with new or updated address
        order.shippingAddress = shippingAddress;
        // order.shippingAddressId = shippingAddress.id;

        // Persist changes to the order
        await this.orderRepository.save(order);

        // Retrieve and return the updated order with all necessary relations
        const updatedOrder = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                'orderedBy',
                'shippingAddress',
                'orderItems',
                'orderItems.product',
                'orderItems.vendor',
            ],
        });

        // Defensive check to ensure updated order was retrieved
        if (!updatedOrder) {
            throw new APIError(500, 'Failed to retrieve updated order');
        }

        return updatedOrder;
    }



    /**
     * Retrieve all orders with related entities.
     *
     * @returns {Promise<Order[]>} - List of all orders including user, shipping address, order items, products, and vendors.
     * @access Admin or authorized roles
     */
    async getAllOrders(): Promise<Order[]> {
        // Fetch all orders with full relations for detailed info
        return await this.orderRepository.find({
            relations: [
                'orderedBy',
                'shippingAddress',
                'orderItems',
                'orderItems.product',
                'orderItems.vendor',
                'orderItems.variant',
            ],
        });
    }

    /**
     * Retrieve detailed information of a single order by its ID.
     *
     * @param {number} orderId - The ID of the order to fetch.
     * @returns {Promise<Order>} - The order with related user, shipping address, items, products, and vendors.
     * @throws {APIError} - Throws 404 error if the order is not found.
     * @access Admin or authorized roles
     */
    async getOrderDetails(orderId: number): Promise<Order> {
        // Find the order by ID with all related entities loaded
        const order = await this.orderRepository.findOne({
            where: { id: orderId, status: Not(OrderStatus.PENDING) },
            relations: [
                'orderedBy',
                'shippingAddress',
                'orderItems',
                'orderItems.product',
                'orderItems.vendor',
                'orderItems.variant',
            ],

        });

        // Throw error if no order is found
        if (!order) {
            throw new APIError(404, 'Order not found');
        }

        // Return the found order with relations
        return order;
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
    async updateOrderStatus(orderId: number, status: IUpdateOrderStatusRequest['status']): Promise<Order> {
        // Retrieve the order with related entities by orderId
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: ['orderedBy', 'shippingAddress', 'orderItems', 'orderItems.product', 'orderItems.vendor'],
        });

        if (!order) {
            throw new APIError(404, 'Order not found');
        }

        const validTransition: Record<OrderStatus, OrderStatus[]> = {
            [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
            [OrderStatus.CONFIRMED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
            [OrderStatus.DELIVERED]: [OrderStatus.CANCELLED],
            [OrderStatus.CANCELLED]: []
        };

        if (order.status !== status && !validTransition[order.status].includes(status)) {
            throw new APIError(400, `Invalid status transition from ${order.status} to ${status}`);
        }

        // Update status
        order.status = status;

        if (status === OrderStatus.DELIVERED && order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
            if (order.paymentStatus !== PaymentStatus.PAID) {
                order.paymentStatus = PaymentStatus.PAID;
            }
        }

        // Save updated order
        await this.orderRepository.save(order);

        // Send notification email to user
        if (order.orderedBy?.email) {
            await sendOrderStatusEmail(order.orderedBy.email, order.id, order.status);
        }

        return order;
    }


    /**
     * Search for an order by its ID, including related entities.
     *
     * @param {number} orderId - The ID of the order to search for.
     * @returns {Promise<Order | null>} - The order if found, otherwise null.
     * @access Admin or authorized users
     */
    async searchOrdersById(orderId: number): Promise<Order | null> {
        return await this.orderRepository.findOne({
            where: { id: orderId },
            relations: ['orderedBy', 'shippingAddress', 'orderItems', 'orderItems.product', 'orderItems.vendor'],
        });
    }


    /**
     * Get all orders that include products sold by a specific vendor.
     *
     * @param {number} vendorId - The ID of the vendor to filter orders by.
     * @returns {Promise<Order[]>} - List of orders containing vendor's products.
     * @access Vendor or Admin
     */
    async getVendorOrders(vendorId: number): Promise<Order[]> {
        // Use QueryBuilder to join related tables and filter orders by vendorId in orderItems
        return await this.orderRepository
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.orderItems', 'orderItems') // Include order items
            .leftJoinAndSelect('order.orderedBy', 'orderedBy') // Include user who placed order
            .leftJoinAndSelect('order.shippingAddress', 'shippingAddress') // Include shipping address
            .leftJoinAndSelect('orderItems.product', 'product') // Include products in order items
            .leftJoinAndSelect('orderItems.vendor', 'vendor') // Include vendor info for order items
            .leftJoinAndSelect('orderItems.variant', 'variant')
            .where('orderItems.vendorId = :vendorId', { vendorId }) // Filter by vendorId
            .andWhere('order.status != :status', { status: OrderStatus.PENDING })
            .orderBy('order.createdAt', 'DESC')
            .getMany(); // Get all matching orders
    }

    /**
     * Get detailed information about a specific order for a vendor,
     * only if the order contains items sold by that vendor.
     *
     * @param {number} vendorId - The ID of the vendor requesting the order details.
     * @param {number} orderId - The ID of the order to retrieve.
     * @returns {Promise<Order>} - The order details with related entities.
     * @throws {APIError} - Throws 404 if order not found or vendor not authorized.
     * @access Vendor
     */
    async getVendorOrderDetails(vendorId: number, orderId: number): Promise<Order> {
        // Query the order with all relevant relations and filter by orderId and vendorId
        const order = await this.orderRepository
            .createQueryBuilder('order')
            .leftJoinAndSelect('order.orderItems', 'orderItems') // Join order items
            .leftJoinAndSelect('order.orderedBy', 'orderedBy') // Join user who placed order
            .leftJoinAndSelect('order.shippingAddress', 'shippingAddress') // Join shipping address
            .leftJoinAndSelect('orderItems.product', 'product') // Join products in order items
            .leftJoinAndSelect('orderItems.vendor', 'vendor') // Join vendor info for order items
            .leftJoinAndSelect('orderItems.variant', 'variant')
            .where('order.id = :orderId', { orderId }) // Filter by order ID
            .andWhere('orderItems.vendorId = :vendorId', { vendorId })
            .andWhere('order.status != :status', { status: OrderStatus.PENDING }) // Filter order items by vendor ID
            .getOne();

        // Throw error if no such order exists or vendor is not authorized to view it
        if (!order) {
            throw new APIError(404, 'Order not found or you are not authorized to view it');
        }

        return order;
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
    async getOrderHistoryForCustomer(userId: number): Promise<Order[]> {
        // Find all orders where orderedById matches the userId
        // Include relations: orderItems, the products within those items, and shipping address
        const orders = await this.orderRepository.find({
            where: { orderedById: userId, status: Not(OrderStatus.PENDING) },
            relations: [
                'orderItems',
                'orderItems.product',
                'orderItems.variant',
                'shippingAddress',
            ],
            order: { createdAt: 'DESC' }, // Sort orders by creation date descending
        });

        // console.log(orders);

        return orders;
    }

    async getOrderDetailByMerchantTransactionId(mTransactionId: string) {
        const order = await this.orderRepository.findOne({
            where: {
                mTransactionId: mTransactionId
            }
        })

        return order;
    }

    async deleteOrder() {
        const order = await this.orderRepository.delete({});
    }
}