import { Response } from 'express';
import { OrderService } from '../service/order.service';
import { AuthRequest, CombinedAuthRequest, VendorAuthRequest } from '../middlewares/auth.middleware';
import { IOrderCreateRequest, IShippingAddressRequest, IUpdateOrderStatusRequest } from '../interface/order.interface';
import { APIError } from '../utils/ApiError.utils';
import { User, UserRole } from '../entities/user.entity';
import { findUserByEmail, getUserByIdService } from '../service/user.service';


/**
 * @class OrderController
 * @description  Handles order-related operations for users, vendors, and admins
 */
export class OrderController {
    private orderService: OrderService;

    constructor() {
        this.orderService = new OrderService();
    }

    /**
     * @desc Create a new order for authenticated user
     * @route POST /orders
     * @access Authenticated User
     * @param req.body {IOrderCreateRequest} Order details
     * @returns Created order data and optional redirectUrl for payment
     */
    async createOrder(req: AuthRequest<{}, {}, IOrderCreateRequest>, res: Response): Promise<void> {
        try {
            // if (!req.user) {
            //     throw new APIError(401, 'User not authenticated');
            // }

            // Call service to create order and possibly get payment redirect URL
            // const { order, redirectUrl } = await this.orderService.createOrder(req.user.id, req.body);

            console.log("---------------Req body ----------------------")
            console.log(req.body)
            const { order, redirectUrl } = await this.orderService.createOrder(12, req.body);

            console.log(order);

            if (redirectUrl) {
                // Payment redirection needed
                res.status(200).json({ success: true, data: order, redirectUrl });
            } else {
                // Order created without payment redirect
                res.status(201).json({ success: true, data: order });
            }
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @desc Handle successful payment notification for an order
     * @route GET /orders/payment/success?orderId=&transactionId=
     * @access Authenticated User
     * @param req.query.orderId Order ID (string)
     * @param req.query.transactionId Payment transaction ID (string)
     * @returns Updated order data after payment verification
     */
    async handlePaymentSuccess(req: AuthRequest<{}, {}, {}, { orderId: string, transactionId: string }>, res: Response): Promise<void> {
        try {
            const { orderId, transactionId } = req.query;

            if (!orderId || !transactionId) {
                throw new APIError(400, 'Missing orderId or transactionId');
            }

            // Verify payment and update order status accordingly
            const order = await this.orderService.verifyPayment(parseInt(orderId, 10), transactionId, req.query);
            res.status(200).json({ success: true, data: order });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @desc Handle payment cancellation for an order
     * @route GET /orders/payment/cancel?orderId=
     * @access Authenticated User
     * @param req.query.orderId Order ID (string)
     * @returns Cancellation confirmation message
     */
    async handlePaymentCancel(req: AuthRequest<{}, {}, {}, { orderId: string }>, res: Response): Promise<void> {
        try {
            const { orderId } = req.query;

            if (!orderId) {
                throw new APIError(400, 'Missing orderId');
            }

            // Perform cancellation logic in service
            await this.orderService.handlePaymentCancel(parseInt(orderId, 10));
            res.status(200).json({ success: false, message: 'Payment cancelled' });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @desc Get all orders for authenticated customer
     * @route GET /orders/customer
     * @access Authenticated User
     * @returns List of orders for the authenticated customer
     */
    async getCustomerOrders(req: AuthRequest, res: Response): Promise<void> {
        try {
            // if (!req.user) {
            //     throw new APIError(401, 'User not authenticated');
            // }
            // Fetch customer orders from service
            const orders = await this.orderService.getCustomerOrders();
            res.status(200).json({ success: true, data: orders });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @desc Get details of a specific order for customer, admin, or vendor with access control
     * @route GET /orders/customer/:orderId
     * @access Admin, Customer who owns order, or Vendor owning products in order
     * @param req.params.orderId Order ID as string
     * @returns Order details if authorized
     */
    async getCustomerOrderDetails(
        req: CombinedAuthRequest<{ orderId: string }>,
        res: Response
    ) {
        try {
            const user = req.user;
            if (!user) {
                throw new APIError(401, 'User not authenticated');
            }

            const orderId = parseInt(req.params.orderId, 10);
            if (isNaN(orderId)) {
                throw new APIError(400, 'Invalid order ID');
            }

            // Retrieve order details
            const order = await this.orderService.getCustomerOrderDetails(orderId);

            // Admin or order owner can access
            if (user.role === UserRole.ADMIN || order.orderedById === user.id) {
                return res.status(200).json({ success: true, data: order });
            }

            // Vendor access: must own at least one product in order
            if (req.vendor) {
                const vendorId = req.vendor.id;
                const hasProductFromVendor = order.orderItems.some(
                    (item) => item.product.vendor.id === vendorId
                );

                if (hasProductFromVendor) {
                    return res.status(200).json({ success: true, data: order });
                }
            }

            throw new APIError(403, 'Forbidden: You do not have access to this order');
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @desc Update shipping address for an order by authenticated user
     * @route PUT /orders/:orderId/shipping-address
     * @access Authenticated User
     * @param req.params.orderId Order ID
     * @param req.body {IShippingAddressRequest} New shipping address details
     * @returns Updated order with new shipping address
     */
    async updateShippingAddress(req: AuthRequest<{ orderId: string }>, res: Response): Promise<void> {
        try {
            if (!req.user) {
                throw new APIError(401, 'User not authenticated');
            }

            const orderId = parseInt(req.params.orderId, 10);
            if (isNaN(orderId)) {
                throw new APIError(400, 'Invalid order ID');
            }

            const addressdata = req.body as IShippingAddressRequest;

            // Update shipping address via service
            const updatedOrder = await this.orderService.updateShippingAddress(req.user.id, orderId, addressdata);
            res.status(200).json({ success: true, data: updatedOrder });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @desc Get all orders (Admin or authorized users)
     * @route GET /orders
     * @access Admin or authorized
     * @returns List of all orders
     */
    async getAllOrders(req: AuthRequest, res: Response): Promise<void> {
        try {
            const orders = await this.orderService.getAllOrders();
            res.status(200).json({ success: true, data: orders });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @desc Get order details by orderId
     * @route GET /orders/:orderId
     * @access Authenticated User
     * @param req.params.orderId Order ID
     * @returns Order details
     */
    async getOrderDetails(req: AuthRequest<{ orderId: string }>, res: Response): Promise<void> {
        try {
            const orderId = parseInt(req.params.orderId, 10);
            if (isNaN(orderId)) {
                throw new APIError(400, 'Invalid order ID');
            }

            const order = await this.orderService.getOrderDetails(orderId);
            res.status(200).json({ success: true, data: order });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @desc Update order status
     * @route PATCH /orders/:orderId/status
     * @access Admin or authorized user
     * @param req.params.orderId Order ID
     * @param req.body.status New status
     * @returns Updated order
     */
    async updateOrderStatus(req: AuthRequest<{ orderId: string }>, res: Response): Promise<void> {
        try {
            const orderId = parseInt(req.params.orderId, 10);
            if (isNaN(orderId)) {
                throw new APIError(400, 'Invalid order ID');
            }

            const { status } = req.body as IUpdateOrderStatusRequest;

            const updatedOrder = await this.orderService.updateOrderStatus(orderId, status);
            res.status(200).json({ success: true, data: updatedOrder });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @desc Search orders by order ID
     * @route GET /orders/search?orderId=
     * @access Authenticated User
     * @param req.query.orderId Order ID as string
     * @returns Order details if found
     */
    async searchOrdersById(req: AuthRequest<{}, {}, {}, { orderId: string }>, res: Response): Promise<void> {
        try {
            const orderIdRaw = req.query.orderId;
            console.log("Order id: ", orderIdRaw);

            if (!orderIdRaw) {
                throw new APIError(400, 'Order ID is required');
            }

            const orderId = parseInt(orderIdRaw, 10);

            if (isNaN(orderId) || orderId <= 0) {
                throw new APIError(400, 'Invalid order ID - must be a positive number');
            }

            const order = await this.orderService.searchOrdersById(orderId);

            if (!order) {
                res.status(404).json({ success: false, message: 'Order not found' });
                return;
            }

            res.status(200).json({ success: true, data: order });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                console.error('Search orders error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    async trackOrderById(req: AuthRequest<{}, {}, {}, { orderId: string, email: string }>, res: Response): Promise<void> {
        try {

            const orderId = Number(req.query.orderId);

            const email = req.query.email;


            if (!orderId) {
                throw new APIError(400, "Order id is requried")
            }

            const userExists = await findUserByEmail(email);

            if (!userExists) {
                throw new APIError(404, "User doesnot exists")
            }

            // get order details by user id and orderid
            const order = await this.orderService.trackOrder(email, orderId);

            console.log(order);

            res.status(200).json({
                success: true,
                orderStatus: order.status
            })

        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                console.error('Search orders error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @desc Get all orders for a vendor
     * @route GET /vendor/orders
     * @access Vendor
     * @returns List of orders associated with vendor's products
     */
    async getVendorOrders(req: VendorAuthRequest, res: Response): Promise<void> {
        try {
            if (!req.vendor) {
                throw new APIError(401, 'Vendor not authenticated');
            }

            const orders = await this.orderService.getVendorOrders(req.vendor.id);
            res.status(200).json({ success: true, data: orders });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @desc Get detailed order information for vendor by order ID
     * @route GET /vendor/orders/:orderId
     * @access Vendor
     * @param req.params.orderId Order ID
     * @returns Order details if vendor owns products in order
     */
    async getVendorOrderDetails(req: VendorAuthRequest<{ orderId: string }>, res: Response): Promise<void> {
        try {
            if (!req.vendor) {
                throw new APIError(401, 'Vendor not authenticated');
            }

            const orderId = parseInt(req.params.orderId, 10);
            if (isNaN(orderId)) {
                throw new APIError(400, 'Invalid order ID');
            }

            const order = await this.orderService.getVendorOrderDetails(req.vendor.id, orderId);
            res.status(200).json({ success: true, data: order });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @desc Get order history for authenticated customer
     * @route GET /orders/customer/history
     * @access Authenticated User
     * @returns List of past orders made by the customer
     */
    async getCustomerOrderHistory(req: AuthRequest, res: Response): Promise<void> {
        try {
            const user = req.user?.id;

            if (!user) {
                throw new APIError(401, 'User not authenticated');
            }

            const orders = await this.orderService.getOrderHistoryForCustomer(user);

            res.status(200).json({
                success: true,
                data: orders
            });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }


    async getOrderDetailByMerchantTransactionId(req: AuthRequest, res: Response) {
        try {
            const { mTransactionId } = req.body as { mTransactionId: string };

            console.log(mTransactionId)

            if (!mTransactionId || typeof mTransactionId !== 'string') {
                throw new APIError(400, "Invalid or missing MerchantTxnId");
            }

            const orders = await this.orderService.getOrderDetailByMerchantTransactionId(mTransactionId);

            if (!orders) {
                throw new APIError(404, "Order not found");
            }

            const userId = orders.orderedById;

            if (req.user.id !== userId && req.user.role !== UserRole.ADMIN) {
                throw new APIError(403, "Not authorized");
            }

            res.status(200).json({
                success: true,
                data: orders
            });

        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    async deleteOrder(req: AuthRequest, res: Response) {
        try {
            const order = await this.orderService.deleteOrder();

            res.status(200).json({ success: true, msg: "Order deleted succesfully" })

        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, msg: error.message })
            } else {
                console.log(error)
                res.status(500).json({ success: false, msg: "Internal server error" })
            }
        }
    }
}
