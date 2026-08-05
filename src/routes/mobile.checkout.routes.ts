import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { MobileCheckoutController } from "../controllers/mobile.checkout.controller";
import { OrderController } from "../controllers/order.controller";
import { mobileCheckoutEstimateSchema, createOrderSchema } from "../utils/zod_validations/order.zod";
import { validateZod } from "../middlewares/validation.middleware";
import { asyncHandler } from "../utils/asyncHandler.utils";

const checkoutRouter = Router();
const controller = new MobileCheckoutController();
const orderController = new OrderController();

/**
 * @swagger
 * /api/checkout/mobile-checkout-details:
 *   get:
 *     summary: Get all data required for mobile checkout in a single request
 *     description: >
 *       Returns the authenticated user's profile, saved checkout defaults,
 *       available payment methods, cart items, vendor data, shipping estimate,
 *       and backend-authoritative priceBreakdown when the saved address is
 *       complete enough to estimate checkout.
 *     tags:
 *       - Checkout
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Checkout details retrieved successfully
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
 *                     user:
 *                       type: object
 *                       description: Authenticated user's profile
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 5
 *                         fullName:
 *                           type: string
 *                           example: "Ramesh Shah"
 *                         username:
 *                           type: string
 *                           example: "shahramesh"
 *                         email:
 *                           type: string
 *                           example: "ramesh@example.com"
 *                         phoneNumber:
 *                           type: string
 *                           example: "9841000000"
 *                         role:
 *                           type: string
 *                           enum: [admin, user, staff, rider]
 *                           example: "user"
 *                         address:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             province:
 *                               type: string
 *                               enum: [Koshi, Madhesh, Bagmati, Gandaki, Lumbini, Karnali, Sudurpashchim]
 *                               example: "Bagmati"
 *                             district:
 *                               type: string
 *                               example: "Kathmandu"
 *                             city:
 *                               type: string
 *                               example: "Kathmandu"
 *                             localAddress:
 *                               type: string
 *                               example: "Thamel, Ward 26"
 *                             streetAddress:
 *                               type: string
 *                               description: Alias of localAddress used by order creation APIs.
 *                               example: "Thamel, Ward 26"
 *                             landmark:
 *                               type: string
 *                               nullable: true
 *                               example: "Near Pilgrims Bookstore"
 *                     cart:
 *                       type: object
 *                       description: User's current cart
 *                       properties:
 *                         id:
 *                           type: integer
 *                           nullable: true
 *                           example: 3
 *                         total:
 *                           type: number
 *                           example: 13998.00
 *                         items:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 7
 *                               productId:
 *                                 type: integer
 *                                 nullable: true
 *                                 example: 12
 *                               name:
 *                                 type: string
 *                                 example: "RLX Explorer - Gray"
 *                               price:
 *                                 type: number
 *                                 example: 6999.00
 *                               quantity:
 *                                 type: integer
 *                                 example: 2
 *                               image:
 *                                 type: string
 *                                 nullable: true
 *                                 format: uri
 *                                 example: "https://res.cloudinary.com/example/image/upload/prod.jpg"
 *                               variantId:
 *                                 type: integer
 *                                 nullable: true
 *                                 example: 60
 *                               vendor:
 *                                 type: object
 *                                 nullable: true
 *                                 properties:
 *                                   id:
 *                                     type: integer
 *                                     example: 2
 *                                   businessName:
 *                                     type: string
 *                                     example: "RLX Watches Nepal"
 *                                   email:
 *                                     type: string
 *                                     example: "vendor@rlxwatches.com"
 *                                   phoneNumber:
 *                                     type: string
 *                                     example: "9800000001"
 *                                   districtId:
 *                                     type: integer
 *                                     example: 27
 *                                   district:
 *                                     type: object
 *                                     nullable: true
 *                                     properties:
 *                                       id:
 *                                         type: integer
 *                                         example: 27
 *                                       name:
 *                                         type: string
 *                                         example: "Kathmandu"
 *                     checkoutReady:
 *                       type: boolean
 *                       description: True when cart and saved profile/address can produce a checkout estimate.
 *                       example: true
 *                     missingCheckoutFields:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: []
 *                     checkoutDefaults:
 *                       type: object
 *                       description: Values the mobile app can prefill in checkout.
 *                       properties:
 *                         fullName:
 *                           type: string
 *                           example: "Ramesh Shah"
 *                         phoneNumber:
 *                           type: string
 *                           example: "9841000000"
 *                         paymentMethod:
 *                           type: string
 *                           enum: [ONLINE_PAYMENT, CASH_ON_DELIVERY, KHALTI, ESEWA, NPX]
 *                           example: CASH_ON_DELIVERY
 *                         shippingAddress:
 *                           type: object
 *                           nullable: true
 *                           description: Uses order creation field names, including streetAddress.
 *                     availablePaymentMethods:
 *                       type: array
 *                       items:
 *                         type: string
 *                         enum: [ONLINE_PAYMENT, CASH_ON_DELIVERY, KHALTI, ESEWA, NPX]
 *                       example: [CASH_ON_DELIVERY, ESEWA, NPX]
 *                     checkoutEstimate:
 *                       type: object
 *                       nullable: true
 *                       description: Same totals returned by /api/order/estimate when checkoutReady is true.
 *                     checkoutEstimateError:
 *                       type: string
 *                       nullable: true
 *                       example: null
 *                     priceBreakdown:
 *                       type: object
 *                       nullable: true
 *                       description: Actual price, product discount, deal discount, promo discount, and line totals.
 *                       properties:
 *                         actualPrice:
 *                           type: number
 *                           example: 5000
 *                         merchandiseSubtotal:
 *                           type: number
 *                           example: 4200
 *                         productDiscountTotal:
 *                           type: number
 *                           example: 500
 *                         dealDiscountTotal:
 *                           type: number
 *                           example: 300
 *                         promoDiscountTotal:
 *                           type: number
 *                           example: 0
 *                         lineItems:
 *                           type: array
 *                           items:
 *                             type: object
 *                     vendorShippingBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                     totals:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         merchandiseSubtotal:
 *                           type: number
 *                         shippingTotal:
 *                           type: number
 *                         discountTotal:
 *                           type: number
 *                         grandTotal:
 *                           type: number
 *       401:
 *         description: Unauthorized - missing or invalid token
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
 *                   example: "Unauthorized"
 *       404:
 *         description: User not found
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
 *                   example: "User not found"
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
checkoutRouter.get(
    "/mobile-checkout-details",
    authMiddleware,
    (req, res) => controller.getCheckoutDetails(req as any, res)
);

/**
 * @swagger
 * /api/checkout/mobile-estimate:
 *   post:
 *     summary: Estimate mobile checkout totals for submitted checkout data
 *     tags: [Checkout]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MobileCheckoutEstimateRequest' }
 *     responses:
 *       200:
 *         description: Backend-authoritative checkout estimate
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CheckoutEstimateResponse' }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
checkoutRouter.post(
    "/mobile-estimate",
    authMiddleware,
    validateZod(mobileCheckoutEstimateSchema),
    asyncHandler(orderController.estimateCheckout.bind(orderController)),
);

/**
 * @swagger
 * /api/checkout/mobile-order:
 *   post:
 *     summary: Create an order from mobile checkout data
 *     tags: [Checkout]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CreateOrderRequest' }
 *     responses:
 *       200:
 *         description: Order creation result, including payment redirect fields when applicable
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 */
checkoutRouter.post(
    "/mobile-order",
    authMiddleware,
    validateZod(createOrderSchema),
    asyncHandler(orderController.createOrder.bind(orderController)),
);

export default checkoutRouter;
