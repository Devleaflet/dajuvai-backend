import { Request, Response, NextFunction } from "express";
import { OrderService } from "../service/order.service";
import {
    AuthRequest,
    CombinedAuthRequest,
    VendorAuthRequest,
} from "../middlewares/auth.middleware";
import {
    IOrderCreateRequest,
    IShippingAddressRequest,
    IUpdateOrderStatusRequest,
    IUpdateVendorOrderStatusRequest,
} from "../interface/order.interface";
import {
    BadRequestError,
    AuthError,
    ForbiddenError,
    NotFoundError,
} from "../errors";
import { UserRole } from "../entities/user.entity";
import { findUserByEmail, findUserById } from "../service/user.service";
import {
    sendCustomerOrderEmail,
    sendVendorOrderEmail,
} from "../utils/nodemailer.utils";
import { VendorService } from "../service/vendor.service";
import { PaymentService } from "../service/payment.service";
import { Order, PaymentMethod } from "../entities/order.entity";
import { OrderStatusChangedByRole } from "../entities/orderStatusHistory.entity";
import AppDataSource from "../config/db.config";
import { Vendor } from "../entities/vendor.entity";
import { In, Repository } from "typeorm";
import { NotificationService } from "../service/notification.service";
import config from "../config/env.config";
import {
    sanitizeOrderFull,
    sanitizeOrderForVendor,
} from "../utils/sanitize.util";

/**
 * @class OrderController
 * @description  Handles order-related operations for users, vendors, and admins
 */
export class OrderController {
    private orderService: OrderService;
    private vendorService: VendorService;
    private paymentService: PaymentService;
    private vendorRepository: Repository<Vendor>;
    private notificationService: NotificationService;

    constructor() {
        this.paymentService = new PaymentService();
        this.orderService = new OrderService();
        this.vendorService = new VendorService();
        this.vendorRepository = AppDataSource.getRepository(Vendor);
        this.notificationService = new NotificationService();
    }

    private buildOrderSummary(order: Order) {
        const toNumber = (value: unknown) => {
            const numeric = Number(value ?? 0);
            return Number.isFinite(numeric) ? numeric : 0;
        };

        return {
            orderId: order.id,
            orderNumber: order.orderNumber,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            subtotal: toNumber(order.merchandiseSubtotal),
            shippingTotal: toNumber(order.shippingFee),
            discountTotal: toNumber(order.discountTotal),
            taxTotal: toNumber(order.taxTotal),
            grandTotal: toNumber(order.totalPrice),
            itemCount: (order.orderItems || []).reduce(
                (sum, item) => sum + toNumber(item.quantity),
                0,
            ),
        };
    }

    /**
     * @desc Create a new order for authenticated user
     * @route POST /orders
     * @access Authenticated User
     */
    async createOrder(
        req: AuthRequest<{}, {}, IOrderCreateRequest>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        if (!req.user) throw new AuthError("User not authenticated");

        const userId = req.user.id;
        const userexists = await findUserById(userId);
        if (!userexists) throw new NotFoundError("User");

        const data = req.body;

        const { order, redirectUrl, vendorids, useremail, esewaRedirectUrl } =
            await this.orderService.createOrder(req.user.id, data);

        const orderSummary = this.buildOrderSummary(order);

        void this.notificationService
            .notifyOrderPlaced(order)
            .catch((error) => {
                console.log("Failed to send order placed notification:", error);
            });

        if (order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY) {
            void (async () => {
                const shippingAddress = order.shippingAddress || null;
                const userDistrict = shippingAddress?.district || null;

                const vendorIds = order.orderItems.map((item) => item.vendorId);
                const uniqueVendorIds = [...new Set(vendorIds)];

                const vendors = await this.vendorRepository.find({
                    where: { id: In(uniqueVendorIds) },
                    relations: ["district"],
                });

                const customerEmailItems = order.orderItems.map((item) => {
                    const vendor = vendors.find((v) => v.id === item.vendorId);
                    return {
                        name: item?.product?.name,
                        sku: item.variant?.sku || null,
                        quantity: item.quantity,
                        price: item.price,
                        variantAttributes: item.variant?.attributes || null,
                        vendorDistrict: vendor?.district?.name || null,
                    };
                });

                // wrap in try catch so that if email fails, order wont fail
                try {
                    await sendCustomerOrderEmail(
                        useremail,
                        order.orderNumber,
                        order.totalPrice,
                        order.shippingFee,
                        customerEmailItems,
                        userDistrict,
                    );
                } catch (error) {
                    console.log("Failed to send customer order email:", error);
                }

                // Admin copy — full breakdown including shipping, same as the customer email.
                if (config.USER_EMAIL) {
                    try {
                        await sendCustomerOrderEmail(
                            config.USER_EMAIL,
                            order.orderNumber,
                            order.totalPrice,
                            order.shippingFee,
                            customerEmailItems,
                            userDistrict,
                            `New Order Placed - #${order.id}`,
                        );
                    } catch (error) {
                        console.log("Failed to send admin order email:", error);
                    }
                }

                const orderItems = order.orderItems;

                for (const vendorId of uniqueVendorIds) {
                    const itemsForVendor = orderItems
                        .filter((item) => item.vendorId === vendorId)
                        .map((item) => ({
                            name: item?.product?.name,
                            sku: item.variant?.sku || null,
                            quantity: item.quantity,
                            price: item.price,
                            variantAttributes: item.variant?.attributes || null,
                        }));

                    if (itemsForVendor.length === 0) continue;

                    const vendor = vendors.find((v) => v.id === vendorId);
                    if (!vendor) continue;

                    try {
                        await sendVendorOrderEmail(
                            vendor.email,
                            order.paymentMethod,
                            order.orderNumber,
                            itemsForVendor,
                            {
                                name: data.fullName || userexists.fullName,
                                phone:
                                    data.phoneNumber || userexists.phoneNumber,
                                email: userexists.email,
                                city: shippingAddress?.city || null,
                                district: shippingAddress?.district || null,
                                localAddress:
                                    shippingAddress?.localAddress || null,
                                landmark: shippingAddress?.landmark || null,
                            },
                        );
                    } catch (error) {
                        console.log(
                            "Failed to send email to vendor, vendor id: ",
                            vendorId,
                            error,
                        );
                    }
                }
            })().catch((error) => {
                console.log("Failed to send COD order emails:", error);
            });
        }

        if (esewaRedirectUrl) {
            res.status(200).json({
                success: true,
                data: order,
                orderSummary,
                ...orderSummary,
                esewaRedirectUrl,
            });
        } else {
            res.status(201).json({
                success: true,
                data: order,
                orderSummary,
                ...orderSummary,
            });
        }
    }

    /**
     * @desc Preview checkout totals (merchandise subtotal, per-vendor shipping
     * breakdown, discount, grand total) without placing an order. Read-only —
     * the frontend must render these numbers instead of recomputing shipping
     * itself.
     * @route POST /orders/estimate
     * @access Authenticated User
     */
    async estimateCheckout(
        req: AuthRequest<{}, {}, IOrderCreateRequest>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        if (!req.user) throw new AuthError("User not authenticated");

        const estimate = await this.orderService.estimateCheckout(
            req.user.id,
            req.body,
        );
        res.status(200).json({ success: true, data: estimate });
    }

    /**
     * @desc Handle successful payment notification for an order
     * @route GET /orders/payment/success?orderId=&transactionId=
     * @access Authenticated User
     */
    async handlePaymentSuccess(
        req: AuthRequest<
            {},
            {},
            {},
            { orderId: string; transactionId: string }
        >,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const { orderId, transactionId } = req.query;

        if (!orderId || !transactionId)
            throw new BadRequestError("Missing orderId or transactionId");

        const order = await this.orderService.verifyPayment(
            parseInt(orderId, 10),
            transactionId,
            req.query,
        );
        res.status(200).json({ success: true, data: order });
    }

    /**
     * @desc Handle payment cancellation for an order
     * @route GET /orders/payment/cancel?orderId=
     * @access Authenticated User
     */
    async handlePaymentCancel(
        req: AuthRequest<{}, {}, {}, { orderId: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const { orderId } = req.query;

        if (!orderId) throw new BadRequestError("Missing orderId");

        await this.orderService.handlePaymentCancel(parseInt(orderId, 10));
        res.status(200).json({ success: false, message: "Payment cancelled" });
    }

    /**
     * @desc Get all orders for authenticated customer
     * @route GET /orders/customer
     * @access Authenticated User
     */
    async getCustomerOrders(
        _req: AuthRequest,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const orders = await this.orderService.getCustomerOrders();
        res.status(200).json({ success: true, data: orders });
    }

    /**
     * @desc Get details of a specific order for customer, admin, or vendor with access control
     * @route GET /orders/customer/:orderId
     * @access Admin, Customer who owns order, or Vendor owning products in order
     */
    async getCustomerOrderDetails(
        req: CombinedAuthRequest<{ orderId: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const user = req.user;
        if (!user) throw new AuthError("User not authenticated");

        const orderId = parseInt(req.params.orderId, 10);
        if (isNaN(orderId)) throw new BadRequestError("Invalid order ID");

        const order = await this.orderService.getCustomerOrderDetails(orderId);

        if (user.role === UserRole.ADMIN || order.orderedById === user.id) {
            res.status(200).json({
                success: true,
                data: sanitizeOrderFull(order),
            });
            return;
        }

        if (req.vendor) {
            const vendorId = req.vendor.id;
            const hasProductFromVendor = order.orderItems.some(
                (item) => item.vendorId === vendorId,
            );

            if (hasProductFromVendor) {
                // Vendor-scoped: never leak another vendor's items, shipping
                // fee, or the order's grand total to this vendor.
                res.status(200).json({
                    success: true,
                    data: sanitizeOrderForVendor(order, vendorId),
                });
                return;
            }
        }

        throw new ForbiddenError("You do not have access to this order");
    }

    async getOrderById(
        req: Request<{ id: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const id = Number(req.params.id);

        const order = await this.orderService.getOrderById(id);
        if (!order) throw new NotFoundError("Order");

        res.status(200).json({ success: true, data: order });
    }

    /**
     * @desc Update shipping address for an order by authenticated user
     * @route PUT /orders/:orderId/shipping-address
     * @access Authenticated User
     */
    async updateShippingAddress(
        req: AuthRequest<{ orderId: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        if (!req.user) throw new AuthError("User not authenticated");

        const orderId = parseInt(req.params.orderId, 10);
        if (isNaN(orderId)) throw new BadRequestError("Invalid order ID");

        const addressdata = req.body as IShippingAddressRequest;
        const updatedOrder = await this.orderService.updateShippingAddress(
            req.user.id,
            orderId,
            addressdata,
        );
        res.status(200).json({ success: true, data: updatedOrder });
    }

    /**
     * @desc Get all orders (Admin or authorized users)
     * @route GET /orders
     * @access Admin or authorized
     */
    async getAllOrders(
        req: AuthRequest<{}, {}, {}, Record<string, string>>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const q = req.query;
        const result = await this.orderService.getAllOrders({
            page: q.page ? Number(q.page) : undefined,
            limit: q.limit ? Number(q.limit) : undefined,
            search: q.search,
            status: q.status as any,
            paymentStatus: q.paymentStatus as any,
            vendorId: q.vendorId ? Number(q.vendorId) : undefined,
            startDate: q.startDate,
            endDate: q.endDate,
            minPrice: q.minPrice ? Number(q.minPrice) : undefined,
            maxPrice: q.maxPrice ? Number(q.maxPrice) : undefined,
            sort: q.sort as any,
        });
        res.status(200).json({
            success: true,
            data: result.items,
            pagination: result.pagination,
        });
    }

    /**
     * @desc Get order details by orderId
     * @route GET /orders/:orderId
     * @access Authenticated User
     */
    async getOrderDetails(
        req: AuthRequest<{ orderId: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const orderId = parseInt(req.params.orderId, 10);
        if (isNaN(orderId)) throw new BadRequestError("Invalid order ID");

        const order = await this.orderService.getOrderDetails(orderId);
        res.status(200).json({ success: true, data: order });
    }

    /**
     * @desc Update order status
     * @route PATCH /orders/:orderId/status
     * @access Admin or authorized user
     */
    async updateOrderStatus(
        req: AuthRequest<{ orderId: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const orderId = parseInt(req.params.orderId, 10);
        if (isNaN(orderId)) throw new BadRequestError("Invalid order ID");
        if (!req.user) throw new AuthError("User not authenticated");

        const { status, expectedCurrentStatus, reason, note } =
            req.body as IUpdateOrderStatusRequest;
        const updatedOrder = await this.orderService.updateOrderStatus(
            orderId,
            status,
            {
                expectedCurrentStatus,
                reason,
                note,
                changedByUserId: req.user.id,
                // This route is admin/staff-only (see order.routes.ts) — vendor
                // status changes go through a separate vendor endpoint.
                changedByRole: OrderStatusChangedByRole.ADMIN,
            },
        );

        await this.notificationService.notifyOrderStatusUpdated(updatedOrder);

        res.status(200).json({ success: true, data: updatedOrder });
    }

    /**
     * @desc Get the status-change timeline for an order
     * @route GET /orders/admin/:orderId/status-history
     * @access Admin or authorized users
     */
    async getOrderStatusHistory(
        req: AuthRequest<{ orderId: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const orderId = parseInt(req.params.orderId, 10);
        if (isNaN(orderId)) throw new BadRequestError("Invalid order ID");

        const history = await this.orderService.getOrderStatusHistory(orderId);
        res.status(200).json({ success: true, data: history });
    }

    /**
     * @desc Search orders by order ID
     * @route GET /orders/search?orderId=
     * @access Authenticated User
     */
    async searchOrdersById(
        req: AuthRequest<{}, {}, {}, { orderId: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const orderIdRaw = req.query.orderId;

        if (!orderIdRaw) throw new BadRequestError("Order ID is required");

        const orderId = parseInt(orderIdRaw, 10);
        if (isNaN(orderId) || orderId <= 0)
            throw new BadRequestError(
                "Invalid order ID - must be a positive number",
            );

        const order = await this.orderService.searchOrdersById(orderId);
        if (!order) throw new NotFoundError("Order");

        res.status(200).json({ success: true, data: order });
    }

    async trackOrderById(
        req: AuthRequest<{}, {}, {}, { orderId: string; email: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const orderId = req.query.orderId;
        const email = req.query.email;

        if (!orderId) throw new BadRequestError("Order Number is required");

        const userExists = await findUserByEmail(email);
        if (!userExists) throw new NotFoundError("User");

        const order = await this.orderService.trackOrder(email, orderId);

        res.status(200).json({ success: true, orderStatus: order.status });
    }

    /**
     * @desc Get all orders for a vendor
     * @route GET /vendor/orders
     * @access Vendor
     */
    async getVendorOrders(
        req: VendorAuthRequest,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        if (!req.vendor) throw new AuthError("Vendor not authenticated");

        const orders = await this.orderService.getVendorOrders(req.vendor.id);
        res.status(200).json({ success: true, data: orders });
    }

    /**
     * @desc Get detailed order information for vendor by order ID
     * @route GET /vendor/orders/:orderId
     * @access Vendor
     */
    async getVendorOrderDetails(
        req: VendorAuthRequest<{ orderId: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        if (!req.vendor) throw new AuthError("Vendor not authenticated");

        const orderId = parseInt(req.params.orderId, 10);
        if (isNaN(orderId)) throw new BadRequestError("Invalid order ID");

        const order = await this.orderService.getVendorOrderDetails(
            req.vendor.id,
            orderId,
        );
        res.status(200).json({ success: true, data: order });
    }

    /**
     * @desc Vendor updates its own fulfillment stage for an order (never the
     * parent order's overall status, and never another vendor's row).
     * @route PUT /vendor/:orderId/status
     * @access Vendor
     */
    async updateVendorOrderStatus(
        req: VendorAuthRequest<
            { orderId: string },
            {},
            IUpdateVendorOrderStatusRequest
        >,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        if (!req.vendor) throw new AuthError("Vendor not authenticated");

        const orderId = parseInt(req.params.orderId, 10);
        if (isNaN(orderId)) throw new BadRequestError("Invalid order ID");

        const { status, reason, note } = req.body;
        const order = await this.orderService.updateVendorOrderStatus(
            req.vendor.id,
            orderId,
            status,
            { reason, note },
        );
        res.status(200).json({ success: true, data: order });
    }

    /**
     * @desc Get order history for authenticated customer
     * @route GET /orders/customer/history
     * @access Authenticated User
     */
    async getCustomerOrderHistory(
        req: AuthRequest,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const user = req.user?.id;
        if (!user) throw new AuthError("User not authenticated");

        const orders = await this.orderService.getOrderHistoryForCustomer(user);
        res.status(200).json({ success: true, data: orders });
    }

    async getOrderDetailByMerchantTransactionId(
        req: AuthRequest,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const { mTransactionId } = req.body as { mTransactionId: string };

        if (!mTransactionId || typeof mTransactionId !== "string") {
            throw new BadRequestError("Invalid or missing MerchantTxnId");
        }

        const orders =
            await this.orderService.getOrderDetailByMerchantTransactionId(
                mTransactionId,
            );
        if (!orders) throw new NotFoundError("Order");

        const userId = orders.orderedById;
        if (req.user.id !== userId && req.user.role !== UserRole.ADMIN) {
            throw new ForbiddenError("Not authorized");
        }

        res.status(200).json({ success: true, data: orders });
    }

    async deleteOrder(
        _req: AuthRequest,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        await this.orderService.deleteOrder();
        res.status(200).json({
            success: true,
            msg: "Order deleted successfully",
        });
    }

    async esewaPaymentSuccess(
        req: AuthRequest,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const { token, orderId } = req.body as {
            token: string;
            orderId: number;
        };
        const order = await this.orderService.esewaSuccess(token, orderId);
        if (order.success) {
            res.status(200).json({ success: true, msg: "Payment successful" });
            return;
        }
        throw new BadRequestError("Payment failed");
    }

    async esewaPaymentFailed(
        req: AuthRequest,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const { orderId } = req.body as { orderId: number };
        const order = await this.orderService.esewaFailed(orderId);
        if (order.success) {
            res.status(200).json({ success: true, msg: "Payment failed" });
            return;
        }
        throw new BadRequestError("Payment not found");
    }

    async checkAvailablePromocode(
        req: AuthRequest,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const { promoCode } = req.body as { promoCode: string };
        const userId = req.user?.id;
        const promo = await this.orderService.checkAvailablePromocode(
            promoCode,
            userId,
        );
        if (promo) {
            res.status(200).json({ success: true, data: promo });
            return;
        }
        throw new NotFoundError("Promo code");
    }
}
