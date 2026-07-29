import { Router } from "express";
import { OrderController } from "../controllers/order.controller";
import {
    authMiddleware,
    combinedAuthMiddleware,
    isAccountOwner,
    isAccountOwnerOrAdmin,
    isAdmin,
    isAdminOrStaff,
    isVendor,
    vendorAuthMiddleware,
} from "../middlewares/auth.middleware";
import { validateZod } from "../middlewares/validation.middleware";
import {
    createOrderSchema,
    shippingAddressSchema,
    updateOrderStatusSchema,
} from "../utils/zod_validations/order.zod";
import { asyncHandler } from "../utils/asyncHandler.utils";

const router = Router();
const orderController = new OrderController();

/**
 * @swagger
 * /api/order:
 *   post:
 *     summary: Create a new order
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - shippingAddress
 *               - paymentMethod
 *               - phoneNumber
 *             properties:
 *               shippingAddress:
 *                 type: object
 *                 required:
 *                   - province
 *                   - city
 *                   - streetAddress
 *                   - district
 *                 properties:
 *                   province:
 *                     type: string
 *                     enum: [Koshi, Madhesh, Bagmati, Gandaki, Lumbini, Karnali, Sudurpashchim]
 *                     example: "Bagmati"
 *                   city:
 *                     type: string
 *                     minLength: 2
 *                     maxLength: 100
 *                     example: "Kathmandu"
 *                   streetAddress:
 *                     type: string
 *                     minLength: 5
 *                     maxLength: 255
 *                     example: "Pulchowk 123"
 *                   district:
 *                     type: string
 *                     example: "Lalitpur"
 *                   landmark:
 *                     type: string
 *                     description: Optional landmark near the address
 *               paymentMethod:
 *                 type: string
 *                 enum: [ONLINE_PAYMENT, CASH_ON_DELIVERY, KHALTI, ESEWA, NPX]
 *                 example: CASH_ON_DELIVERY
 *               phoneNumber:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 10
 *                 example: "9812345678"
 *                 description: Must be exactly 10 digits
 *               promoCode:
 *                 type: string
 *                 example: "SUMMER2025"
 *                 description: Optional promo code
 *               fullName:
 *                 type: string
 *                 example: "John Doe"
 *                 description: Optional full name for the order
 *               isBuyNow:
 *                 type: boolean
 *                 example: false
 *                 description: If true, bypasses cart and uses productId/variantId/quantity instead
 *               productId:
 *                 type: integer
 *                 example: 35
 *                 description: Required if isBuyNow is true
 *               variantId:
 *                 type: integer
 *                 example: 60
 *                 description: Optional variant ID for buy-now
 *               quantity:
 *                 type: integer
 *                 example: 1
 *                 default: 1
 *                 description: Quantity for buy-now (defaults to 1)
 *     responses:
 *       201:
 *         description: Order created successfully (for COD or without redirect)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 101
 *                     totalPrice:
 *                       type: number
 *                       example: 1599.00
 *                     shippingFee:
 *                       type: number
 *                       example: 200
 *                     status:
 *                       type: string
 *                       example: "ORDER_PLACED"
 *                     paymentStatus:
 *                       type: string
 *                       example: "UNPAID"
 *                     paymentMethod:
 *                       type: string
 *                       example: "CASH_ON_DELIVERY"
 *                     shippingAddressId:
 *                       type: integer
 *                       example: 5
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-06-11T12:00:00Z"
 *       200:
 *         description: Order created successfully and redirect URL provided (for ESEWA/KHALTI)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 101
 *                     totalPrice:
 *                       type: number
 *                       example: 1599.00
 *                     shippingFee:
 *                       type: number
 *                       example: 200
 *                     status:
 *                       type: string
 *                       example: "ORDER_PLACED"
 *                     paymentStatus:
 *                       type: string
 *                       example: "UNPAID"
 *                     paymentMethod:
 *                       type: string
 *                       example: "ESEWA"
 *                     shippingAddressId:
 *                       type: integer
 *                       example: 5
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-06-11T12:00:00Z"
 *                 redirectUrl:
 *                   type: string
 *                   format: uri
 *                   example: "https://esewa.com.np/initiate?tx=abc123"
 *       400:
 *         description: Invalid input or cart is empty
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Cart is empty"
 *       401:
 *         description: Unauthorized request
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "User not authenticated"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */

router.post(
    "/",
    authMiddleware,
    validateZod(createOrderSchema),
    asyncHandler(orderController.createOrder.bind(orderController)),
);

// Read-only checkout preview: same vendor-grouped shipping/discount calc as
// createOrder, without writing an order — the frontend renders these
// numbers instead of recomputing shipping itself.
/**
 * @swagger
 * /api/order/estimate:
 *   post:
 *     summary: Preview checkout totals and transparent price breakdown
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     description: Returns backend-authoritative merchandise, shipping, promo, deal, and product-discount totals without creating an order. Used by web and mobile checkout.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cartData:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: integer
 *                       example: 1
 *                     quantity:
 *                       type: integer
 *                       example: 2
 *               promoCode:
 *                 type: string
 *                 example: "SUMMER2025"
 *     responses:
 *       200:
 *         description: Checkout estimate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     merchandiseSubtotal:
 *                       type: number
 *                       example: 4200
 *                     priceBreakdown:
 *                       type: object
 *                       properties:
 *                         actualPrice:
 *                           type: number
 *                           example: 5000
 *                         productDiscountTotal:
 *                           type: number
 *                           example: 300
 *                         dealDiscountTotal:
 *                           type: number
 *                           example: 500
 *                         promoDiscountTotal:
 *                           type: number
 *                           example: 100
 *                         lineItems:
 *                           type: array
 *                           items:
 *                             type: object
 *                     shippingTotal:
 *                       type: number
 *                       example: 200
 *                     discountTotal:
 *                       type: number
 *                       example: 100
 *                     grandTotal:
 *                       type: number
 *                       example: 4300
 */
router.post(
    "/estimate",
    authMiddleware,
    asyncHandler(orderController.estimateCheckout.bind(orderController)),
);

/**
 * @swagger
 * /api/order:
 *   get:
 *     summary: Get all customer orders (Admin only)
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of all customer orders
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 101
 *                       totalPrice:
 *                         type: number
 *                         example: 1499.99
 *                       shippingFee:
 *                         type: number
 *                         example: 200
 *                       status:
 *                         type: string
 *                         example: "ORDER_PLACED"
 *                       paymentStatus:
 *                         type: string
 *                         example: "ORDER_PLACED"
 *                       paymentMethod:
 *                         type: string
 *                         example: "CASH_ON_DELIVERY"
 *                       shippingAddress:
 *                         type: object
 *                         properties:
 *                           city:
 *                             type: string
 *                             example: "Kathmandu"
 *                           district:
 *                             type: string
 *                             example: "Lalitpur"
 *                           streetAddress:
 *                             type: string
 *                             example: "Pulchowk 123"
 *                           province:
 *                             type: string
 *                             example: "Bagmati"
 *                       orderedBy:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 25
 *                           name:
 *                             type: string
 *                             example: "John Doe"
 *                           email:
 *                             type: string
 *                             example: "john@example.com"
 *                       orderItems:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             productId:
 *                               type: integer
 *                               example: 55
 *                             quantity:
 *                               type: integer
 *                               example: 2
 *                             price:
 *                               type: number
 *                               example: 599.99
 *                             vendorId:
 *                               type: integer
 *                               example: 8
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "User not authenticated"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */

router.get(
    "/",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(orderController.getAllOrders.bind(orderController)),
);

/**
 * @swagger
 * /api/order/payment/success:
 *   get:
 *     summary: Handle payment success callback and verify payment
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: query
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the order for which payment was made
 *       - in: query
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment gateway transaction ID
 *     responses:
 *       200:
 *         description: Payment verified successfully, updated order returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 101
 *                     orderedById:
 *                       type: integer
 *                       example: 25
 *                     paymentStatus:
 *                       type: string
 *                       enum: [PAID, UNPAID]
 *                       example: PAID
 *                     status:
 *                       type: string
 *                       enum: [ORDER_PLACED, CONFIRMED, PROCESSING, ARRIVED_AT_WAREHOUSE, DELAYED, ASSIGNED_TO_RIDER, DELIVERED, NOT_RECEIVED, CANCELLED, RETURNED]
 *                       example: CONFIRMED
 *                     transactionId:
 *                       type: string
 *                       example: "abc123xyz"
 *                     gatewayResponse:
 *                       type: string
 *                       example: '{"transactionId":"abc123xyz","status":"success","amount":99.99}'
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-06-11T12:34:56Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-06-12T14:20:00Z"
 *                     orderedBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 25
 *                         name:
 *                           type: string
 *                           example: "John Doe"
 *                         email:
 *                           type: string
 *                           example: "john@example.com"
 *                     shippingAddress:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 555
 *                         province:
 *                           type: string
 *                           example: "Ontario"
 *                         city:
 *                           type: string
 *                           example: "Toronto"
 *                         streetAddress:
 *                           type: string
 *                           example: "123 Maple St."
 *                         district:
 *                           type: string
 *                           example: "Downtown"
 *                     orderItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 999
 *                           quantity:
 *                             type: integer
 *                             example: 2
 *                           product:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 333
 *                               name:
 *                                 type: string
 *                                 example: "Wireless Mouse"
 *                               description:
 *                                 type: string
 *                                 example: "Ergonomic wireless mouse"
 *                               price:
 *                                 type: number
 *                                 format: float
 *                                 example: 25.99
 *                           vendor:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 44
 *                               name:
 *                                 type: string
 *                                 example: "Tech Vendor Inc."
 *       400:
 *         description: Missing orderId or transactionId query parameter
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Missing orderId or transactionId"
 *       404:
 *         description: Order not found with given orderId and transactionId
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
router.get(
    "/payment/success",
    asyncHandler(orderController.handlePaymentSuccess.bind(orderController)),
);

/**
 * @swagger
 * /api/order/payment/cancel:
 *   get:
 *     summary: Handle payment cancellation callback and mark order payment as failed
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: query
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the order whose payment was cancelled
 *     responses:
 *       200:
 *         description: Payment cancellation acknowledged and order updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Payment cancelled
 *       400:
 *         description: Missing or invalid orderId query parameter
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Missing orderId
 *       404:
 *         description: Order not found with the specified ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Order not found
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Internal server error
 */
router.get(
    "/payment/cancel",
    asyncHandler(orderController.handlePaymentCancel.bind(orderController)),
);

/**
 * @swagger
 * /api/order/{orderId}:
 *   get:
 *     summary: Get order details by order ID (accessible to owner or admin)
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: orderId
 *         in: path
 *         required: true
 *         description: ID of the order to retrieve
 *         schema:
 *           type: integer
 *           example: 123
 *     responses:
 *       200:
 *         description: Order details fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 123
 *                     totalPrice:
 *                       type: number
 *                       example: 2499.50
 *                     shippingFee:
 *                       type: number
 *                       example: 200
 *                     status:
 *                       type: string
 *                       example: "ORDER_PLACED"
 *                     paymentStatus:
 *                       type: string
 *                       example: "ORDER_PLACED"
 *                     paymentMethod:
 *                       type: string
 *                       example: "ESEWA"
 *                     shippingAddress:
 *                       type: object
 *                       properties:
 *                         city:
 *                           type: string
 *                           example: "Kathmandu"
 *                         district:
 *                           type: string
 *                           example: "Lalitpur"
 *                         streetAddress:
 *                           type: string
 *                           example: "Jhamsikhel"
 *                         province:
 *                           type: string
 *                           example: "Bagmati"
 *                     orderedBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 10
 *                         name:
 *                           type: string
 *                           example: "Aarav Shrestha"
 *                         email:
 *                           type: string
 *                           example: "aarav@example.com"
 *                     orderItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: integer
 *                             example: 88
 *                           quantity:
 *                             type: integer
 *                             example: 3
 *                           price:
 *                             type: number
 *                             example: 799.83
 *                           vendorId:
 *                             type: integer
 *                             example: 5
 *                           product:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: "Organic Mustard Oil"
 *                               basePrice:
 *                                 type: number
 *                                 example: 899.99
 *                           priceBreakdown:
 *                             type: object
 *                             description: Historical item price transparency snapshot.
 *                             properties:
 *                               basePrice:
 *                                 type: number
 *                                 example: 999
 *                               unitPrice:
 *                                 type: number
 *                                 example: 799
 *                               productDiscount:
 *                                 type: object
 *                               dealDiscount:
 *                                 type: object
 *                     priceBreakdown:
 *                       type: object
 *                       description: Order-level actual price, product discount, deal discount, promo discount, and line totals for web/mobile checkout detail screens.
 *       400:
 *         description: Invalid order ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid order ID"
 *       401:
 *         description: Unauthorized - User not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "User not authenticated"
 *       403:
 *         description: Forbidden - Not allowed to access this order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Forbidden: You do not have access to this order"
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
router.get(
    "/:orderId",
    combinedAuthMiddleware,
    asyncHandler(orderController.getCustomerOrderDetails.bind(orderController)),
);

/**
 * @swagger
 * /api/order/customer/order/{id}:
 *   get:
 *     summary: Get order details by order ID
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         description: ID of the order to retrieve
 *         schema:
 *           type: integer
 *           example: 123
 *     responses:
 *       200:
 *         description: Order details fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 123
 *                     totalPrice:
 *                       type: number
 *                       example: 2499.50
 *                     shippingFee:
 *                       type: number
 *                       example: 200
 *                     status:
 *                       type: string
 *                       example: "ORDER_PLACED"
 *                     paymentStatus:
 *                       type: string
 *                       example: "ORDER_PLACED"
 *                     paymentMethod:
 *                       type: string
 *                       example: "ESEWA"
 *                     shippingAddress:
 *                       type: object
 *                       properties:
 *                         city:
 *                           type: string
 *                           example: "Kathmandu"
 *                         district:
 *                           type: string
 *                           example: "Lalitpur"
 *                         streetAddress:
 *                           type: string
 *                           example: "Jhamsikhel"
 *                         province:
 *                           type: string
 *                           example: "Bagmati"
 *                     orderedBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 10
 *                         name:
 *                           type: string
 *                           example: "Aarav Shrestha"
 *                         email:
 *                           type: string
 *                           example: "aarav@example.com"
 *                     orderItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: integer
 *                             example: 88
 *                           quantity:
 *                             type: integer
 *                             example: 3
 *                           price:
 *                             type: number
 *                             example: 799.83
 *                           vendorId:
 *                             type: integer
 *                             example: 5
 *                           product:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: "Organic Mustard Oil"
 *                               basePrice:
 *                                 type: number
 *                                 example: 899.99
 *                           priceBreakdown:
 *                             type: object
 *                             description: Historical item price transparency snapshot.
 *                     priceBreakdown:
 *                       type: object
 *                       description: Order-level actual price, product discount, deal discount, promo discount, and line totals for mobile checkout/order detail screens.
 *       400:
 *         description: Invalid order ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid order ID"
 *       401:
 *         description: Unauthorized - User not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "User not authenticated"
 *       403:
 *         description: Forbidden - Not allowed to access this order
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Forbidden: You do not have access to this order"
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
router.get(
    "/customer/order/:id",
    authMiddleware,
    asyncHandler(orderController.getOrderById.bind(orderController)),
);

// /**
//  * @swagger
//  * /api/order/{orderId}/address:
//  *   put:
//  *     summary: Update the shipping address for a pending order
//  *     tags:
//  *       - Orders
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - name: orderId
//  *         in: path
//  *         required: true
//  *         description: ID of the order to update shipping address for
//  *         schema:
//  *           type: integer
//  *           example: 101
//  *     requestBody:
//  *       required: true
//  *       content:
//  *         application/json:
//  *           schema:
//  *             type: object
//  *             properties:
//  *               province:
//  *                 type: string
//  *                 enum: [Koshi, Madhesh, Bagmati, Gandaki, Lumbini, Karnali, Sudurpashchim]
//  *                 example: Bagmati
//  *               city:
//  *                 type: string
//  *                 example: "Kathmandu"
//  *               district:
//  *                 type: string
//  *                 example: "Lalitpur"
//  *               streetAddress:
//  *                 type: string
//  *                 example: "Pulchowk Road, Ward 3"
//  *     responses:
//  *       200:
//  *         description: Shipping address updated successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   type: object
//  *                   properties:
//  *                     id:
//  *                       type: integer
//  *                       example: 101
//  *                     shippingAddress:
//  *                       type: object
//  *                       properties:
//  *                         province:
//  *                           type: string
//  *                           example: "Bagmati"
//  *                         city:
//  *                           type: string
//  *                           example: "Kathmandu"
//  *                         district:
//  *                           type: string
//  *                           example: "Lalitpur"
//  *                         streetAddress:
//  *                           type: string
//  *                           example: "Pulchowk Road, Ward 3"
//  *                     status:
//  *                       type: string
//  *                       example: "ORDER_PLACED"
//  *                     orderedBy:
//  *                       type: object
//  *                       properties:
//  *                         id:
//  *                           type: integer
//  *                           example: 12
//  *                         name:
//  *                           type: string
//  *                           example: "Bikash Shahi"
//  *                     orderItems:
//  *                       type: array
//  *                       items:
//  *                         type: object
//  *                         properties:
//  *                           productId:
//  *                             type: integer
//  *                             example: 45
//  *                           quantity:
//  *                             type: integer
//  *                             example: 2
//  *                           product:
//  *                             type: object
//  *                             properties:
//  *                               name:
//  *                                 type: string
//  *                                 example: "Pure Ghee"
//  *                               basePrice:
//  *                                 type: number
//  *                                 example: 1500.00
//  *       400:
//  *         description: Invalid order ID
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: false
//  *                 message:
//  *                   type: string
//  *                   example: "Invalid order ID"
//  *       401:
//  *         description: User not authenticated
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: false
//  *                 message:
//  *                   type: string
//  *                   example: "User not authenticated"
//  *       404:
//  *         description: Order not found or not editable
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: false
//  *                 message:
//  *                   type: string
//  *                   example: "Order not found or cannot update address"
//  *       500:
//  *         description: Server error while updating shipping address
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: false
//  *                 message:
//  *                   type: string
//  *                   example: "Internal server error"
//  */
// router.put('/:orderId/address', authMiddleware, validateZod(shippingAddressSchema), asyncHandler(orderController.updateShippingAddress.bind(orderController)));

// /**
//  * @swagger
//  * /api/order/admin:
//  *   get:
//  *     summary: Retrieve all orders (Admin only)
//  *     tags:
//  *       - Orders
//  *     security:
//  *       - bearerAuth: []
//  *     responses:
//  *       200:
//  *         description: List of all orders with details
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   type: array
//  *                   items:
//  *                     type: object
//  *                     properties:
//  *                       id:
//  *                         type: integer
//  *                         example: 101
//  *                       totalPrice:
//  *                         type: number
//  *                         example: 3500
//  *                       paymentStatus:
//  *                         type: string
//  *                         example: "ORDER_PLACED"
//  *                       status:
//  *                         type: string
//  *                         example: "ORDER_PLACED"
//  *                       orderedBy:
//  *                         type: object
//  *                         properties:
//  *                           id:
//  *                             type: integer
//  *                             example: 12
//  *                           name:
//  *                             type: string
//  *                             example: "Bikash Shahi"
//  *                       shippingAddress:
//  *                         type: object
//  *                         properties:
//  *                           province:
//  *                             type: string
//  *                             example: "Bagmati"
//  *                           city:
//  *                             type: string
//  *                             example: "Kathmandu"
//  *                           district:
//  *                             type: string
//  *                             example: "Lalitpur"
//  *                           streetAddress:
//  *                             type: string
//  *                             example: "Pulchowk Road, Ward 3"
//  *                       orderItems:
//  *                         type: array
//  *                         items:
//  *                           type: object
//  *                           properties:
//  *                             productId:
//  *                               type: integer
//  *                               example: 45
//  *                             quantity:
//  *                               type: integer
//  *                               example: 2
//  *                             price:
//  *                               type: number
//  *                               example: 1500.00
//  *                             product:
//  *                               type: object
//  *                               properties:
//  *                                 name:
//  *                                   type: string
//  *                                   example: "Pure Ghee"
//  *                             vendor:
//  *                               type: object
//  *                               properties:
//  *                                 id:
//  *                                   type: integer
//  *                                   example: 3
//  *                                 name:
//  *                                   type: string
//  *                                   example: "Vendor Name"
//  *       401:
//  *         description: User not authenticated
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: false
//  *                 message:
//  *                   type: string
//  *                   example: "User not authenticated"
//  *       403:
//  *         description: Forbidden - user is not admin
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: false
//  *                 message:
//  *                   type: string
//  *                   example: "Access denied"
//  *       500:
//  *         description: Internal server error
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: false
//  *                 message:
//  *                   type: string
//  *                   example: "Internal server error"
//  */
// router.get('/admin', authMiddleware, isAdmin, asyncHandler(orderController.getAllOrders.bind(orderController))); // all orders

/**
 * @swagger
 * /api/order/admin/{orderId}:
 *   get:
 *     summary: Retrieve details of a specific order by ID (Admin only)
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the order to get
 *     responses:
 *       200:
 *         description: Order details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 101
 *                     totalPrice:
 *                       type: number
 *                       example: 3500
 *                     paymentStatus:
 *                       type: string
 *                       example: "ORDER_PLACED"
 *                     status:
 *                       type: string
 *                       example: "ORDER_PLACED"
 *                     orderedBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 12
 *                         name:
 *                           type: string
 *                           example: "Bikash Shahi"
 *                     shippingAddress:
 *                       type: object
 *                       properties:
 *                         province:
 *                           type: string
 *                           example: "Bagmati"
 *                         city:
 *                           type: string
 *                           example: "Kathmandu"
 *                         district:
 *                           type: string
 *                           example: "Lalitpur"
 *                         streetAddress:
 *                           type: string
 *                           example: "Pulchowk Road, Ward 3"
 *                     orderItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: integer
 *                             example: 45
 *                           quantity:
 *                             type: integer
 *                             example: 2
 *                           price:
 *                             type: number
 *                             example: 1500.00
 *                           product:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: "Pure Ghee"
 *                           vendor:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 3
 *                               name:
 *                                 type: string
 *                                 example: "Vendor Name"
 *       400:
 *         description: Invalid order ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid order ID"
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
router.get(
    "/admin/:orderId",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(orderController.getOrderDetails.bind(orderController)),
); // order by id

/**
 * @swagger
 * /api/order/admin/{orderId}/status:
 *   put:
 *     summary: Update the status of an order (Admin only)
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the order to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *               - reason
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [ORDER_PLACED, CONFIRMED, PROCESSING, ARRIVED_AT_WAREHOUSE, DELAYED, ASSIGNED_TO_RIDER, DELIVERED, NOT_RECEIVED, CANCELLED, RETURNED]
 *                 example: CONFIRMED
 *               expectedCurrentStatus:
 *                 type: string
 *                 enum: [ORDER_PLACED, CONFIRMED, PROCESSING, ARRIVED_AT_WAREHOUSE, DELAYED, ASSIGNED_TO_RIDER, DELIVERED, NOT_RECEIVED, CANCELLED, RETURNED]
 *                 description: Optimistic concurrency guard — rejects if order status has changed since client last fetched it
 *               reason:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 500
 *                 example: "Customer confirmed receipt of items"
 *                 description: Required reason for the status change
 *               note:
 *                 type: string
 *                 maxLength: 1000
 *                 example: "Called customer to verify delivery"
 *                 description: Optional additional context
 *     responses:
 *       200:
 *         description: Order status updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 101
 *                     status:
 *                       type: string
 *                       example: CONFIRMED
 *                     orderedBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 12
 *                         name:
 *                           type: string
 *                           example: "Bikash Shahi"
 *                     shippingAddress:
 *                       type: object
 *                       properties:
 *                         province:
 *                           type: string
 *                           example: "Bagmati"
 *                         city:
 *                           type: string
 *                           example: "Kathmandu"
 *                         district:
 *                           type: string
 *                           example: "Lalitpur"
 *                         streetAddress:
 *                           type: string
 *                           example: "Pulchowk Road, Ward 3"
 *                     orderItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: integer
 *                             example: 45
 *                           quantity:
 *                             type: integer
 *                             example: 2
 *                           price:
 *                             type: number
 *                             example: 1500.00
 *                           product:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: "Pure Ghee"
 *                           vendor:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 3
 *                               name:
 *                                 type: string
 *                                 example: "Vendor Name"
 *       400:
 *         description: Invalid order ID or invalid status transition
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid status transition from ORDER_PLACED to DELIVERED"
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
router.put(
    "/admin/:orderId/status",
    authMiddleware,
    isAdminOrStaff,
    validateZod(updateOrderStatusSchema),
    asyncHandler(orderController.updateOrderStatus.bind(orderController)),
);

/**
 * @swagger
 * /api/order/admin/{orderId}/status-history:
 *   get:
 *     summary: Get order status change history
 *     description: Returns a chronological list of all status changes for a specific order. Admin/Staff only.
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the order
 *     responses:
 *       200:
 *         description: Status history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       previousStatus:
 *                         type: string
 *                         nullable: true
 *                         example: "ORDER_PLACED"
 *                       newStatus:
 *                         type: string
 *                         example: "CONFIRMED"
 *                       changedBy:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           username:
 *                             type: string
 *                             example: "admin"
 *                       changedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-06-11T12:00:00Z"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Admin or Staff access required
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.get(
    "/admin/:orderId/status-history",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(orderController.getOrderStatusHistory.bind(orderController)),
);

/**
 * @swagger
 * /api/order/admin/order/search:
 *   get:
 *     summary: Search for an order by ID (Admin only)
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the order to search
 *     responses:
 *       200:
 *         description: Order found and returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 101
 *                     orderedBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 12
 *                         name:
 *                           type: string
 *                           example: "Bikash Shahi"
 *                     shippingAddress:
 *                       type: object
 *                       properties:
 *                         province:
 *                           type: string
 *                           example: "Bagmati"
 *                         city:
 *                           type: string
 *                           example: "Kathmandu"
 *                         district:
 *                           type: string
 *                           example: "Lalitpur"
 *                         streetAddress:
 *                           type: string
 *                           example: "Pulchowk Road, Ward 3"
 *                     orderItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: integer
 *                             example: 45
 *                           quantity:
 *                             type: integer
 *                             example: 2
 *                           price:
 *                             type: number
 *                             example: 1500.00
 *                           product:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: "Pure Ghee"
 *                           vendor:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 3
 *                               name:
 *                                 type: string
 *                                 example: "Vendor Name"
 *       400:
 *         description: Invalid order ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid order ID"
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Order not found"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
router.get(
    "/admin/order/search",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(orderController.searchOrdersById.bind(orderController)),
);

/**
 * @swagger
 * /api/order/user/track:
 *   get:
 *     summary: Track order status by order ID
 *     description: Returns the status of a specific order by order ID (passed as query parameter).
 *     tags:
 *       - Orders
 *     parameters:
 *       - in: query
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the order to be tracked.
 *     responses:
 *       200:
 *         description: Order status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 orderStatus:
 *                   type: string
 *                   enum: [ORDER_PLACED, CONFIRMED, PROCESSING, ARRIVED_AT_WAREHOUSE, DELAYED, ASSIGNED_TO_RIDER, DELIVERED, NOT_RECEIVED, CANCELLED, RETURNED]
 *                   example: CONFIRMED
 *       400:
 *         description: Bad request - order ID missing or invalid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Order id is required"
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Order does not exist"
 *       500:
 *         description: Internal server error
 */
router.get(
    "/user/track",
    asyncHandler(orderController.trackOrderById.bind(orderController)),
);

/**
 * @swagger
 * /api/order/vendor/orders:
 *   get:
 *     summary: Get all orders containing products for the authenticated vendor
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of orders for the vendor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 101
 *                       orderedBy:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 12
 *                           name:
 *                             type: string
 *                             example: "Customer Name"
 *                       shippingAddress:
 *                         type: object
 *                         properties:
 *                           province:
 *                             type: string
 *                             example: "Bagmati"
 *                           city:
 *                             type: string
 *                             example: "Kathmandu"
 *                           district:
 *                             type: string
 *                             example: "Lalitpur"
 *                           streetAddress:
 *                             type: string
 *                             example: "Pulchowk Road, Ward 3"
 *                       orderItems:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             productId:
 *                               type: integer
 *                               example: 45
 *                             quantity:
 *                               type: integer
 *                               example: 2
 *                             price:
 *                               type: number
 *                               example: 1500.00
 *                             product:
 *                               type: object
 *                               properties:
 *                                 name:
 *                                   type: string
 *                                   example: "Pure Ghee"
 *                             vendor:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                   example: 3
 *                                 name:
 *                                   type: string
 *                                   example: "Vendor Name"
 *       401:
 *         description: Vendor not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Vendor not authenticated"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
router.get(
    "/vendor/orders",
    vendorAuthMiddleware,
    isVendor,
    asyncHandler(orderController.getVendorOrders.bind(orderController)),
);

/**
 * @swagger
 * /api/order/vendor/orders/export:
 *   get:
 *     summary: Export every order matching the current filters (Vendor only, no pagination)
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All matching orders, unpaginated
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data: []
 *       401:
 *         description: Unauthorized
 */
router.get(
    "/vendor/orders/export",
    vendorAuthMiddleware,
    isVendor,
    asyncHandler(orderController.exportVendorOrders.bind(orderController)),
);

/**
 * @swagger
 * /api/order/vendor/{orderId}:
 *   get:
 *     summary: Get details of a specific order for the authenticated vendor
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the order to retrieve
 *     responses:
 *       200:
 *         description: Order details for the vendor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 101
 *                     orderedBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 12
 *                         name:
 *                           type: string
 *                           example: "Customer Name"
 *                     shippingAddress:
 *                       type: object
 *                       properties:
 *                         province:
 *                           type: string
 *                           example: "Bagmati"
 *                         city:
 *                           type: string
 *                           example: "Kathmandu"
 *                         district:
 *                           type: string
 *                           example: "Lalitpur"
 *                         streetAddress:
 *                           type: string
 *                           example: "Pulchowk Road, Ward 3"
 *                     orderItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: integer
 *                             example: 45
 *                           quantity:
 *                             type: integer
 *                             example: 2
 *                           price:
 *                             type: number
 *                             example: 1500.00
 *                           product:
 *                             type: object
 *                             properties:
 *                               name:
 *                                 type: string
 *                                 example: "Pure Ghee"
 *                           vendor:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 3
 *                               name:
 *                                 type: string
 *                                 example: "Vendor Name"
 *       400:
 *         description: Invalid order ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Invalid order ID"
 *       401:
 *         description: Vendor not authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Vendor not authenticated"
 *       404:
 *         description: Order not found or unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Order not found or you are not authorized to view it"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
router.get(
    "/vendor/:orderId",
    vendorAuthMiddleware,
    asyncHandler(orderController.getVendorOrderDetails.bind(orderController)),
);

/**
 * @swagger
 * /api/order/vendor/{orderId}/status-history:
 *   get:
 *     summary: Get order status change history for vendor
 *     description: Returns a chronological list of all status changes for a specific order. Vendor only.
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the order
 *     responses:
 *       200:
 *         description: Status history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       previousStatus:
 *                         type: string
 *                         nullable: true
 *                         example: "ORDER_PLACED"
 *                       newStatus:
 *                         type: string
 *                         example: "CONFIRMED"
 *                       changedBy:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           username:
 *                             type: string
 *                             example: "vendor_user"
 *                       changedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-06-11T12:00:00Z"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Vendor access required
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.get(
    "/vendor/:orderId/status-history",
    vendorAuthMiddleware,
    isVendor,
    asyncHandler(orderController.getVendorOrderStatusHistory.bind(orderController)),
);

/**
 * @swagger
 * /api/order/customer/history:
 *   get:
 *     summary: Get order history for the logged-in customer
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully fetched order history
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                         example: 12
 *                       totalPrice:
 *                         type: number
 *                         format: float
 *                         example: 250.50
 *                       shippingFee:
 *                         type: number
 *                         format: float
 *                         example: 20.00
 *                       paymentStatus:
 *                         type: string
 *                         enum: [PAID, UNPAID]
 *                         example: PAID
 *                       paymentMethod:
 *                         type: string
 *                         enum: [ONLINE_PAYMENT, CASH_ON_DELIVERY, KHALTI, ESEWA, NPX]
 *                         example: CASH_ON_DELIVERY
 *                       status:
 *                         type: string
 *                         enum: [ORDER_PLACED, CONFIRMED, PROCESSING, ARRIVED_AT_WAREHOUSE, DELAYED, ASSIGNED_TO_RIDER, DELIVERED, NOT_RECEIVED, CANCELLED, RETURNED]
 *                         example: ORDER_PLACED
 *                       shippingAddress:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: number
 *                             example: 7
 *                           city:
 *                             type: string
 *                             example: Kathmandu
 *                           street:
 *                             type: string
 *                             example: New Baneshwor
 *                       orderItems:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: number
 *                               example: 101
 *                             quantity:
 *                               type: number
 *                               example: 2
 *                             product:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: number
 *                                   example: 45
 *                                 name:
 *                                   type: string
 *                                   example: Wireless Mouse
 *                                 basePrice:
 *                                   type: number
 *                                   example: 120.00
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-06-16T12:00:00.000Z"
 *       401:
 *         description: Unauthorized - user not logged in
 *       500:
 *         description: Internal server error
 */
router.get(
    "/customer/history",
    authMiddleware,
    orderController.getCustomerOrderHistory.bind(orderController),
);

/**
 * @swagger
 * /api/order/search/merchant-transactionId:
 *   post:
 *     summary: Get order details by Merchant Transaction ID
 *     description: Fetches order details using the merchant transaction ID. Requires admin authentication.
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []  # Adjust according to your security scheme (e.g., JWT bearer token)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - mTransactionId
 *             properties:
 *               mTransactionId:
 *                 type: string
 *                 description: Merchant transaction ID to search for
 *                 example: "TXN123456"
 *     responses:
 *       200:
 *         description: Successfully retrieved order details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Order'
 *       400:
 *         description: Invalid or missing Merchant Transaction ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Invalid or missing MerchantTxnId
 *       401:
 *         description: Unauthorized - Merchant transaction ID required or user not admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Merchant transaction id is required
 *       404:
 *         description: Order not found for the given Merchant Transaction ID
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Order not found
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Internal server error
 */
router.post(
    "/search/merchant-transactionId",
    authMiddleware,
    orderController.getOrderDetailByMerchantTransactionId.bind(orderController),
);

/**
 * @swagger
 * /api/order/order/delete/all:
 *   delete:
 *     summary: Delete all orders (dev/test only)
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All orders deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "All orders deleted successfully"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal server error"
 */
router.delete(
    "/order/delete/all",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(orderController.deleteOrder.bind(orderController)),
);

/**
 * @swagger
 * /api/order/esewa/success:
 *   post:
 *     summary: Handle eSewa payment success callback
 *     description: Processes the eSewa payment success callback, updates order status to CONFIRMED and payment status to PAID.
 *     tags:
 *       - Orders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, orderId]
 *             properties:
 *               token:
 *                 type: string
 *                 description: eSewa payment token returned for the order
 *                 example: "eyJ0cmFuc2FjdGlvbl9jb2RlIjoiMDAwMEFCQyJ9"
 *               orderId:
 *                 type: integer
 *                 description: Internal order ID being paid
 *                 example: 42
 *     responses:
 *       200:
 *         description: Payment verified and order updated successfully
 *         content:
 *           application/json:
 *             example: { success: true, data: { id: 101, paymentStatus: "PAID" } }
 *       400:
 *         description: Invalid payment data
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.post(
    "/esewa/success",
    orderController.esewaPaymentSuccess.bind(orderController),
);

/**
 * @swagger
 * /api/order/esewa/fail:
 *   post:
 *     summary: Handle eSewa payment failure callback
 *     description: Processes the eSewa payment failure callback and marks the order as CANCELLED/UNPAID.
 *     tags:
 *       - Orders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [orderId]
 *             properties:
 *               orderId:
 *                 type: integer
 *                 description: Internal order ID whose payment failed
 *                 example: 42
 *     responses:
 *       200:
 *         description: Payment failure handled
 *         content:
 *           application/json:
 *             example: { success: false, message: "Payment cancelled" }
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
router.post(
    "/esewa/fail",
    orderController.esewaPaymentFailed.bind(orderController),
);

/**
 * @swagger
 * /api/order/check-promo:
 *   post:
 *     summary: Check and apply a promo code
 *     description: Validates a promo code and returns the discount percentage if valid.
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - promoCode
 *             properties:
 *               promoCode:
 *                 type: string
 *                 example: "SUMMER2025"
 *     responses:
 *       200:
 *         description: Promo code is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 discountPercentage:
 *                   type: integer
 *                   example: 15
 *       400:
 *         description: Invalid or expired promo code
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Promo code not found
 *       500:
 *         description: Internal server error
 */
router.post(
    "/check-promo",
    authMiddleware,
    orderController.checkAvailablePromocode.bind(orderController),
);

export default router;
