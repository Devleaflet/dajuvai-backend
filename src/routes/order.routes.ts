import { Router } from 'express';
import { OrderController } from '../controllers/order.controller';
import { authMiddleware, combinedAuthMiddleware, isAccountOwner, isAccountOwnerOrAdmin, isAdmin, isAdminOrStaff, isVendor, validateZod, vendorAuthMiddleware } from '../middlewares/auth.middleware';
import { createOrderSchema, shippingAddressSchema, updateOrderStatusSchema } from '../utils/zod_validations/order.zod';
import { asyncHandler } from '../utils/asyncHandler.utils';

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
 *                     example: "Bagmati"
 *                   city:
 *                     type: string
 *                     example: "Kathmandu"
 *                   streetAddress:
 *                     type: string
 *                     example: "Pulchowk 123"
 *                   district:
 *                     type: string
 *                     example: "Lalitpur"
 *               paymentMethod:
 *                 type: string
 *                 enum: [ESEWA, KHALTI, CASH_ON_DELIVERY]
 *                 example: CASH_ON_DELIVERY
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
 *                       example: "PENDING"
 *                     paymentStatus:
 *                       type: string
 *                       example: "PENDING"
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
 *                       example: "PENDING"
 *                     paymentStatus:
 *                       type: string
 *                       example: "PENDING"
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

router.post('/', authMiddleware, validateZod(createOrderSchema), asyncHandler(orderController.createOrder.bind(orderController)));


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
 *                         example: "PENDING"
 *                       paymentStatus:
 *                         type: string
 *                         example: "PENDING"
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

router.get('/', authMiddleware, isAdminOrStaff, asyncHandler(orderController.getCustomerOrders.bind(orderController)));


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
 *                       enum: [PENDING, COMPLETED, FAILED]
 *                       example: COMPLETED
 *                     status:
 *                       type: string
 *                       enum: [PENDING, CONFIRMED, PROCESSING, SHIPPED, OUT_FOR_DELIVERY, DELIVERED]
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
router.get('/payment/success', asyncHandler(orderController.handlePaymentSuccess.bind(orderController)));


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
router.get('/payment/cancel', asyncHandler(orderController.handlePaymentCancel.bind(orderController)));


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
 *                       example: "PENDING"
 *                     paymentStatus:
 *                       type: string
 *                       example: "PENDING"
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
router.get('/:orderId', combinedAuthMiddleware, asyncHandler(orderController.getCustomerOrderDetails.bind(orderController)));


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
//  *                       example: "PENDING"
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
//  *                         example: "PENDING"
//  *                       status:
//  *                         type: string
//  *                         example: "PENDING"
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
 *                       example: "PENDING"
 *                     status:
 *                       type: string
 *                       example: "PENDING"
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
router.get('/admin/:orderId', authMiddleware, isAdminOrStaff, asyncHandler(orderController.getOrderDetails.bind(orderController)));// order by id


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
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [PENDING, CONFIRMED, CANCELLED, DELIVERED]
 *                 example: CONFIRMED
 *             required:
 *               - status
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
 *                   example: "Invalid status transition from PENDING to DELIVERED"
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
router.put('/admin/:orderId/status', authMiddleware, isAdminOrStaff, validateZod(updateOrderStatusSchema), asyncHandler(orderController.updateOrderStatus.bind(orderController)));


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
router.get('/admin/order/search', authMiddleware, isAdminOrStaff, asyncHandler(orderController.searchOrdersById.bind(orderController)));


/**
 * @swagger
 * /api/order/user/track:
 *   get:
 *     summary: Track order status by order ID
 *     description: Returns the status of a specific order by order ID.
 *     tags:
 *       - Orders
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderId
 *             properties:
 *               orderId:
 *                 type: number
 *                 example: 123
 *                 description: ID of the order to be tracked.
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
 *                   enum: [PENDING, CONFIRMED, CANCELLED, DELIVERED]
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
router.get("/user/track", asyncHandler(orderController.trackOrderById.bind(orderController)));

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
router.get('/vendor/orders', vendorAuthMiddleware, isVendor, asyncHandler(orderController.getVendorOrders.bind(orderController)));

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
router.get('/vendor/:orderId', vendorAuthMiddleware, asyncHandler(orderController.getVendorOrderDetails.bind(orderController)));


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
 *                         enum: [ONLINE_PAYMENT, CASH_ON_DELIVERY, KHALTI, ESEWA]
 *                         example: CASH_ON_DELIVERY
 *                       status:
 *                         type: string
 *                         enum: [PENDING, CONFIRMED, CANCELLED]
 *                         example: CONFIRMED
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
router.get("/customer/history", authMiddleware, orderController.getCustomerOrderHistory.bind(orderController));


/**
 * @swagger
 * /api/order/search/merchant-transactionId:
 *   get:
 *     summary: Get order details by Merchant Transaction ID
 *     description: Fetches order details using the merchant transaction ID. Requires admin authentication.
 *     tags:
 *       - Orders
 *     security:
 *       - bearerAuth: []  # Adjust according to your security scheme (e.g., JWT bearer token)
 *     parameters:
 *       - in: body
 *         name: mTransactionId
 *         description: Merchant transaction ID to search for
 *         required: true
 *         schema:
 *           type: string
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
router.post("/search/merchant-transactionId", authMiddleware, orderController.getOrderDetailByMerchantTransactionId.bind(orderController));

// router.delete("/order/delete/all", orderController.deleteOrder.bind(orderController));

export default router;