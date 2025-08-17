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
import { add } from 'winston';
import { number, string } from 'zod';
import { InventoryStatus } from '../entities/product.enum';


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


    /**
    * Initialize repositories and dependent services.
    * Uses AppDataSource to get TypeORM repositories for database operations.
    * Instantiates CartService and PaymentService for related business logic.
    */
    constructor() {
        // Repository to perform CRUD operations on Order entities
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
        // Fetch the cart belonging to the user, including nested relations:
        // - items in the cart
        // - each item's associated product
        // - the vendor of each product
        // - the district of each vendor
        const cart = await this.cartRepository.findOne({
            where: { userId },
            relations: ['items', 'items.product', 'items.product.vendor', 'items.product.vendor.district'],
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
        user: any
    ): Promise<Address> {

        let address = await this.addressRepository.findOne({
            where: {
                userId: userId
            }
        })

        if (address) {

            //  Check if user's existing address matches the shipping address from the request
            if (
                address.province === shippingAddress.province &&
                address.district === shippingAddress.district &&
                address.city === shippingAddress.city &&
                address.localAddress === shippingAddress.streetAddress
            ) {
                return address;
            }

            address = { ...address, ...shippingAddress }
            return this.addressRepository.save(address);
        }

        const newAddress = this.addressRepository.create({ ...shippingAddress, userId });
        return this.addressRepository.save(newAddress);
    }


    /**
     * Convert cart items into OrderItem entities for persistence.
     *
     * @param {any[]} cartItems - The list of cart items to convert.
     *                            Each item must include a `product` object with `id` and `vendorId`, along with `quantity` and `price`.
     * @returns {OrderItem[]} - Array of OrderItem entities ready to be saved to the database.
     */
    private createOrderItems(cartItems: any[]): OrderItem[] {
        // Map each cart item into a new OrderItem entity using the orderItemRepository
        return cartItems.map(item =>
            this.orderItemRepository.create({
                productId: item.product.id,            // Reference to the product being ordered
                quantity: item.quantity,               // Quantity ordered
                price: item.price,                     // Final price at time of order
                vendorId: item.product.vendorId,       // Associated vendor (for vendor-specific order access)
                product: item.product,                 // Optionally include full product object (for ORM relation mapping)
            })
        );
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
        user: any,
        cart: any,
        address: Address,
        shippingFee: number,
        orderData: IOrderCreateRequest
    ): Promise<Order> {
        // Convert cart items into OrderItem entities
        const orderItems = this.createOrderItems(cart.items);

        // initialize discount 
        let discountAmount = 0;
        let appliedPromoCode: string | null = null;

        if (orderData.promoCode) {
            const promo = await this.promoService.findPromoByCode(orderData.promoCode);
            if (!promo) {
                throw new APIError(400, 'Invalid or expired promo code');
            }
            discountAmount = (parseFloat(cart.total) * promo.discountPercentage) / 100;
            appliedPromoCode = promo.promoCode;

        }


        // Compute the total price (cart total + shipping)
        const totalPrice = parseFloat(cart.total) - discountAmount + shippingFee;

        // Return a new Order entity with all details set
        return this.orderRepository.create({
            orderedById: userId,                             // FK to user
            orderedBy: user,                                 // ORM relation (optional, for eager loading)
            totalPrice: totalPrice,            // Total cost to customer
            shippingFee,
            serviceCharge: orderData.serviceCharge || 0,
            instrumentName: orderData.instrumentName || null,
            paymentStatus: PaymentStatus.UNPAID,             // Default status is unpaid
            paymentMethod: orderData.paymentMethod,          // Payment method from user input
            appliedPromoCode,
            // Determine order status based on payment method
            status:
                orderData.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
                    ? OrderStatus.CONFIRMED                  // Confirmed for COD
                    : OrderStatus.PENDING,                   // Else pending

            shippingAddress: address,
            orderItems,
            phoneNumber: orderData.phoneNumber,
        });
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
    async createOrder(
        userId: number,
        orderData: IOrderCreateRequest
    ): Promise<{ order: Order; redirectUrl?: string }> {
        try {
            const { shippingAddress, paymentMethod, phoneNumber } = orderData;

            console.log(shippingAddress);

            // Fetch user, cart, and shipping district in parallel
            const [user, cart, _district] = await Promise.all([
                this.getUser(userId),                                  // Get user and their saved address
                this.getCart(userId),                                  // Get cart with populated product and vendor info
                this.getDistrict(shippingAddress.district),            // Validate if district exists in system
            ]);

            // Check stock before creating the order
            for (const item of cart.items) {
                const product = await this.productRepository.findOne({ where: { id: item.product.id } });
                if (!product || product.stock < item.quantity) {
                    throw new APIError(400, `Insufficient stock for product: ${product?.name || 'unknown'}`);
                }
            }


            // Either fetch user's existing address or create a new one based on input
            const address = await this.getOrCreateAddress(userId, shippingAddress, user);

            // Calculate total shipping fee based on cart items and destination address
            const shippingFee = await this.calculateShippingFee(address, userId, cart.items);

            // Create the Order entity (not yet saved in DB)
            let order = await this.createOrderEntity(userId, user, cart, address, shippingFee, orderData);
            console.log(order);

            let redirectUrl: string | undefined;

            // Handle different payment methods
            if (paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
                // Save order directly for COD
                order = await this.orderRepository.save(order);


                for (const item of order.orderItems) {
                    const product = await this.productRepository.findOne({
                        where: {
                            id: item.product.id
                        }
                    })

                    if (!product) {
                        throw new APIError(404, `Product not found for order item ID: ${item.id}`);
                    }


                    if (product.stock < item.quantity) {
                        throw new APIError(400, `Insufficient stock for product ${product.name}`);
                    }

                    product.stock -= item.quantity;

                    // update product status
                    if (product.stock <= 0) {
                        product.status = InventoryStatus.OUT_OF_STOCK;
                    } else if (product.stock < 5) {
                        product.status = InventoryStatus.LOW_STOCK;
                    } else {
                        product.status = InventoryStatus.AVAILABLE;
                    }

                    await this.productRepository.save(product);
                }

                await this.cartService.clearCart(userId);
            } else if (
                paymentMethod === PaymentMethod.ONLINE_PAYMENT ||
                paymentMethod === PaymentMethod.ESEWA ||
                paymentMethod === PaymentMethod.KHALIT
            ) {
                // Save order first before initiating online payment
                order = await this.orderRepository.save(order);
                console.log(order);
            } else {
                // Invalid payment method fallback
                throw new APIError(400, 'Invalid payment method');
            }

            return { order, redirectUrl };

        } catch (error) {
            // Wrap unexpected errors in a generic 500 API error
            console.log(error)
            throw error instanceof APIError ? error : new APIError(500, 'Failed to create order');
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
    private async calculateShippingFee(shippingAddress: Address, userId: number, cartItems: CartItem[]): Promise<number> {
        // Validate presence of shipping address
        if (!shippingAddress) {
            throw new APIError(400, "Shipping address is missing");
        }

        // Track unique vendor districts for this cart
        const vendorDistrictSet = new Set<string>();

        // Loop through cart items to extract and validate each vendor's district
        for (const item of cartItems) {
            const vendorDistrict = item.product?.vendor?.district;

            // Ensure vendor and district information is present
            if (!vendorDistrict || !vendorDistrict.name) {
                throw new APIError(400, `Vendor for product ${item.product.id} has no valid address`);
            }

            vendorDistrictSet.add(vendorDistrict.name);
        }

        // Extract user's district from the shipping address
        const userDistrict = shippingAddress.district;

        // These districts are treated as part of the same metro area for lower shipping
        const sameDistrictGroup = ['Kathmandu', 'Bhaktapur', 'Lalitpur'];

        let shippingFee = 0;

        // For each unique vendor district, calculate fee based on proximity
        for (const vendorDistrict of vendorDistrictSet) {
            const isSameCity =
                userDistrict === vendorDistrict ||
                (sameDistrictGroup.includes(userDistrict) && sameDistrictGroup.includes(vendorDistrict));

            // Add either local (100) or non-local (200) fee
            shippingFee += isSameCity ? 100 : 200;
        }

        // Return total shipping fee
        return shippingFee;
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

        // Throw error if order does not exist
        if (!order) {
            throw new APIError(404, 'Order not found');
        }

        // defining valid transition 
        const validTransition: Record<OrderStatus, OrderStatus[]> = {
            [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
            [OrderStatus.CONFIRMED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
            [OrderStatus.DELIVERED]: [OrderStatus.CANCELLED],
            [OrderStatus.CANCELLED]: []
        }

        // check if new status is valid based on the currentstatus
        if (order.status !== status && !validTransition[order.status].includes(status)) {
            throw new APIError(400, `Invalid status transition from ${order.status} to ${status}`);
        }

        // Update the order status
        order.status = status;

        if (status === OrderStatus.DELIVERED && order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
            if (order.paymentStatus !== PaymentStatus.PAID) {
                order.paymentStatus = PaymentStatus.PAID;
            }
        }

        // Save the updated order entity in the database
        await this.orderRepository.save(order);

        // Return the updated order
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

        // Debug log: output fetched orders (can be removed in production)
        console.log(orders);

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