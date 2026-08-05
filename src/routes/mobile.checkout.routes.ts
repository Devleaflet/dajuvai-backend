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
 *     summary: Get mobile checkout bootstrap data
 *     description: Returns authenticated user, cart, saved checkout defaults, available payment methods, and backend-calculated checkout totals when checkout is ready.
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Checkout bootstrap data.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MobileCheckoutDetailsResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       404:
 *         description: Authenticated user was not found.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       500:
 *         $ref: '#/components/responses/InternalServerError'
 */
checkoutRouter.get(
    "/mobile-checkout-details",
    authMiddleware,
    (req, res) => controller.getCheckoutDetails(req as any, res),
);

/**
 * @swagger
 * /api/checkout/mobile-estimate:
 *   post:
 *     summary: Estimate mobile checkout totals
 *     description: Validates checkout input and returns server-authoritative merchandise, discount, shipping, tax, and grand totals without creating an order.
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/MobileCheckoutEstimateRequest'
 *     responses:
 *       200:
 *         description: Checkout estimate.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CheckoutEstimateResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
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
 *     summary: Create order from mobile checkout data
 *     description: Creates an order after validating shipping address, payment method, phone number, and optional buy-now fields. CASH_ON_DELIVERY returns HTTP 201; payment methods requiring redirect return HTTP 200 with esewaRedirectUrl when applicable.
 *     tags: [Checkout]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateOrderRequest'
 *     responses:
 *       200:
 *         description: Order created with payment redirect flow.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateOrderResponse'
 *       201:
 *         description: Order created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/CreateOrderResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
checkoutRouter.post(
    "/mobile-order",
    authMiddleware,
    validateZod(createOrderSchema),
    asyncHandler(orderController.createOrder.bind(orderController)),
);

export default checkoutRouter;
