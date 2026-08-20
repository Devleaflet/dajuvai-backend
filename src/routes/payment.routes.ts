import { Request, Response } from "express";
import crypto from "crypto";
import axios from "axios";
import { Router } from "express";
import { DeliveryStatus, Order, OrderStatus, PaymentStatus } from "../entities/order.entity";
import { Variant } from "../entities/variant.entity";
import { Product } from "../entities/product.entity";
import { CheckoutDraft, CheckoutDraftStatus } from "../entities/checkoutDraft.entity";
import AppDataSource from "../config/db.config";
import config from "../config/env.config";
import { APIError } from "../utils/ApiError.utils";
import { CartService } from "../service/cart.service";
import { NotificationService } from "../service/notification.service";
import { OrderService } from "../service/order.service";
import {
    NPS_CONFIG,
    generateNpsSignature,
    getNpsAuthHeader,
} from "../service/nps-payment.service";

const paymentRouter = Router();
const orderDb = AppDataSource.getRepository(Order);
const draftDb = AppDataSource.getRepository(CheckoutDraft);

// Shared NPS gateway helpers live in nps-payment.service; aliased here to
// keep the existing call sites readable.
const CONFIG = NPS_CONFIG;
const generateSignature = generateNpsSignature;
const getAuthHeader = getNpsAuthHeader;

const requirePaymentFields = (body: Record<string, unknown>, fields: string[]) => {
    const missing = fields.filter((field) => body[field] === undefined || body[field] === null || body[field] === "");
    if (missing.length > 0) {
        return { success: false, errorCode: "VALIDATION_ERROR", message: `Missing required field(s): ${missing.join(", ")}` };
    }
    return null;
};

/**
 * @swagger
 * /api/payments/payment-instruments:
 *   get:
 *     summary: Get available payment instruments
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: List of available payment instruments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [code, data]
 *               properties:
 *                 code:
 *                   type: string
 *                   example: "0"
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PaymentInstrument'
 *                 message:
 *                   type: string
 *                   nullable: true
 *       500:
 *         description: Failed to get payment instruments
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
 *                   example: "Failed to get payment instruments"
 */
// 1. Get Payment Instruments
paymentRouter.get(
    "/payment-instruments",
    async (_req: Request, res: Response) => {
        try {
            const requestData: Record<string, string> = {
                MerchantId: CONFIG.MERCHANT_ID,
                MerchantName: CONFIG.MERCHANT_NAME,
            };

            requestData.Signature = generateSignature(
                requestData,
                CONFIG.SECRET_KEY,
            );

            const response = await axios.post(
                `${CONFIG.BASE_URL}/GetPaymentInstrumentDetails`,
                requestData,
                {
                    headers: {
                        Authorization: getAuthHeader(),
                        "Content-Type": "application/json",
                    },
                },
            );

            res.json(response.data);
    } catch (error: any) {
        res.status(500).json({
            error: "Failed to get payment instruments",
        });
    }
});

/**
 * @swagger
 * /api/payments/service-charge:
 *   post:
 *     summary: Get service charge for a payment amount and instrument
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - instrumentCode
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 500
 *               instrumentCode:
 *                 type: string
 *                 example: "ESEWA"
 *     responses:
 *       200:
 *         description: Service charge retrieved successfully
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
 *       500:
 *         description: Failed to get service charge
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
 *                   example: "Failed to get service charge"
 */
// 2. Get Service Charge
paymentRouter.post("/service-charge", async (req: Request, res: Response) => {
    try {
        const { amount, instrumentCode } = req.body;
        const validationError = requirePaymentFields(req.body, ["amount", "instrumentCode"]);
        if (validationError) {
            res.status(400).json(validationError);
            return;
        }
        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
            res.status(400).json({ success: false, errorCode: "VALIDATION_ERROR", message: "amount must be a positive number" });
            return;
        }

        const requestData: Record<string, string> = {
            MerchantId: CONFIG.MERCHANT_ID,
            MerchantName: CONFIG.MERCHANT_NAME,
            Amount: amount.toString(),
            InstrumentCode: instrumentCode,
        };

        requestData.Signature = generateSignature(
            requestData,
            CONFIG.SECRET_KEY,
        );

        const response = await axios.post(
            `${CONFIG.BASE_URL}/GetServiceCharge`,
            requestData,
            {
                headers: {
                    Authorization: getAuthHeader(),
                    "Content-Type": "application/json",
                },
            },
        );

        res.json(response.data);
    } catch (error: any) {
        res.status(500).json({ error: "Failed to get service charge" });
    }
});

/**
 * @swagger
 * /api/payments/process-id:
 *   post:
 *     summary: Get a process ID for initiating a payment
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *               - merchantTxnId
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 500
 *               merchantTxnId:
 *                 type: string
 *                 example: "TXN_001"
 *     responses:
 *       200:
 *         description: Process ID retrieved successfully
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
 *       500:
 *         description: Failed to get process ID
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
 *                   example: "Failed to get process ID"
 */
// 3. Get Process ID
paymentRouter.post("/process-id", async (req: Request, res: Response) => {
    try {
        const { amount, merchantTxnId } = req.body;
        const validationError = requirePaymentFields(req.body, ["amount", "merchantTxnId"]);
        if (validationError) {
            res.status(400).json(validationError);
            return;
        }
        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
            res.status(400).json({ success: false, errorCode: "VALIDATION_ERROR", message: "amount must be a positive number" });
            return;
        }

        const requestData: Record<string, string> = {
            MerchantId: CONFIG.MERCHANT_ID,
            MerchantName: CONFIG.MERCHANT_NAME,
            Amount: amount.toString(),
            MerchantTxnId: merchantTxnId,
        };

        requestData.Signature = generateSignature(
            requestData,
            CONFIG.SECRET_KEY,
        );

        const response = await axios.post(
            `${CONFIG.BASE_URL}/GetProcessId`,
            requestData,
            {
                headers: {
                    Authorization: getAuthHeader(),
                    "Content-Type": "application/json",
                },
            },
        );

        res.json(response.data);
    } catch (error: any) {
        res.status(500).json({ error: "Failed to get process ID" });
    }
});

/**
 * @swagger
 * /api/payments/initiate-payment:
 *   post:
 *     summary: Initiate a complete payment flow via Nepal Payment Gateway
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - amount
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 1500
 *               instrumentCode:
 *                 type: string
 *                 example: "ESEWA"
 *               transactionRemarks:
 *                 type: string
 *                 example: "Payment for order #123"
 *               orderId:
 *                 type: integer
 *                 example: 42
 *                 description: Existing order id (legacy/COD retry flow). Use draftId for online-payment checkouts.
 *               draftId:
 *                 type: integer
 *                 example: 7
 *                 description: Checkout draft id returned by POST /api/order for online payments.
 *     responses:
 *       200:
 *         description: Payment initiation data returned successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 paymentUrl:
 *                   type: string
 *                   example: "https://gateway.nepalpayment.com/Payment/Index"
 *                 formData:
 *                   type: object
 *                 merchantTxnId:
 *                   type: string
 *       400:
 *         description: Failed to get process ID
 *       404:
 *         description: Order not found
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
// 4. Initiate Payment (Complete Flow)
paymentRouter.post("/initiate-payment", async (req: Request, res: Response) => {
    try {
        const { amount, instrumentCode, transactionRemarks, orderId, draftId } =
            req.body;
        const validationError = requirePaymentFields(req.body, ["amount"]);
        if (validationError) {
            res.status(400).json(validationError);
            return;
        }
        const hasOrderId = orderId !== undefined && orderId !== null && orderId !== "";
        const hasDraftId = draftId !== undefined && draftId !== null && draftId !== "";
        if (!hasOrderId && !hasDraftId) {
            res.status(400).json({ success: false, errorCode: "VALIDATION_ERROR", message: "Either orderId or draftId is required" });
            return;
        }
        if (
            !Number.isFinite(Number(amount)) || Number(amount) <= 0 ||
            (hasOrderId && !Number.isInteger(Number(orderId))) ||
            (hasDraftId && !Number.isInteger(Number(draftId)))
        ) {
            res.status(400).json({ success: false, errorCode: "VALIDATION_ERROR", message: "amount must be positive and orderId/draftId must be integers" });
            return;
        }

        const merchantTxnId = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const processData: Record<string, string> = {
            MerchantId: CONFIG.MERCHANT_ID,
            MerchantName: CONFIG.MERCHANT_NAME,
            Amount: amount.toString(),
            MerchantTxnId: merchantTxnId,
        };

        processData.Signature = generateSignature(
            processData,
            CONFIG.SECRET_KEY,
        );

        const processResponse = await axios.post(
            `${CONFIG.BASE_URL}/GetProcessId`,
            processData,
            {
                headers: {
                    Authorization: getAuthHeader(),
                    "Content-Type": "application/json",
                },
            },
        );

        if (processResponse.data.code !== "0") {
            res.status(400).json({
                error: "Failed to get process ID",
                details: processResponse.data,
            });
            return;
        }

        const processId = processResponse.data.data.ProcessId;

        const paymentData: Record<string, string> = {
            MerchantId: CONFIG.MERCHANT_ID,
            MerchantName: CONFIG.MERCHANT_NAME,
            Amount: amount.toString(),
            MerchantTxnId: merchantTxnId,
            ProcessId: processId,
            InstrumentCode: instrumentCode || "",
            TransactionRemarks: transactionRemarks || "Payment via API",
            ResponseUrl: `${config.FRONTEND_URL}/order/payment-response`,
        };

        paymentData.Signature = generateSignature(
            paymentData,
            CONFIG.SECRET_KEY,
        );

        if (hasDraftId) {
            // Draft-based checkout: no order exists yet — it materializes
            // only after the gateway confirms success.
            const draft = await draftDb.findOne({ where: { id: Number(draftId) } });
            if (!draft || draft.status !== CheckoutDraftStatus.PENDING) {
                throw new APIError(404, "Checkout session not found or no longer active");
            }
            if (draft.expiresAt && draft.expiresAt <= new Date()) {
                throw new APIError(410, "This checkout session has expired. Please check out again.");
            }
            // Never trust the client-provided amount over the priced draft.
            const draftTotal = Number(draft.totals?.totalPrice);
            if (!Number.isFinite(draftTotal) || Math.abs(draftTotal - Number(amount)) > 0.01) {
                throw new APIError(400, "Payment amount does not match the checkout total");
            }
            draft.mTransactionId = merchantTxnId;
            if (draft.payload) {
                draft.payload = { ...draft.payload, instrumentName: instrumentCode || null };
            }
            await draftDb.save(draft);
        } else {
            const order = await orderDb.findOne({ where: { id: Number(orderId) } });
            if (!order) {
                throw new APIError(404, "Order not found");
            }

            // Update order with merchant transaction info
            order.mTransactionId = merchantTxnId;
            order.instrumentName = instrumentCode;

            await orderDb.save(order);
        }

        res.json({
            success: true,
            paymentUrl: `${CONFIG.GATEWAY_URL}/Payment/Index`,
            formData: paymentData,
            merchantTxnId,
        });
    } catch (error) {
        if (error instanceof APIError) {
            res.status(error.status).json({
                success: false,
                message: error.message,
            });
        } else {
            res.status(500).json({
                success: false,
                message: "Internal server error",
            });
        }
    }
});

/**
 * @swagger
 * /api/payments/check-status:
 *   post:
 *     summary: Check the status of a transaction
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - merchantTxnId
 *             properties:
 *               merchantTxnId:
 *                 type: string
 *                 example: "TXN_1700000000000_abc123"
 *     responses:
 *       200:
 *         description: Transaction status retrieved successfully
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
 *       500:
 *         description: Failed to check transaction status
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
 *                   example: "Failed to check transaction status"
 */
// 5. Check Transaction Status
paymentRouter.post("/check-status", async (req: Request, res: Response) => {
    try {
        const { merchantTxnId } = req.body;

        const requestData: Record<string, string> = {
            MerchantId: CONFIG.MERCHANT_ID,
            MerchantName: CONFIG.MERCHANT_NAME,
            MerchantTxnId: merchantTxnId,
        };

        requestData.Signature = generateSignature(
            requestData,
            CONFIG.SECRET_KEY,
        );

        const response = await axios.post(
            `${CONFIG.BASE_URL}/CheckTransactionStatus`,
            requestData,
            {
                headers: {
                    Authorization: getAuthHeader(),
                    "Content-Type": "application/json",
                },
            },
        );

        res.json(response.data);

        // Settle a pending checkout draft based on the gateway verdict.
        // Response is already sent — failures here only log.
        try {
            const draft = await draftDb.findOne({
                where: {
                    mTransactionId: merchantTxnId,
                    status: CheckoutDraftStatus.PENDING,
                },
            });
            if (draft) {
                const rawStatus = String(response.data?.data?.Status ?? "");
                const orderService = new OrderService();
                if (/success/i.test(rawStatus)) {
                    await orderService.materializeDraftOrder(draft, merchantTxnId);
                } else if (/fail|cancel|declin/i.test(rawStatus)) {
                    await orderService.cancelCheckoutDraft(draft, "Gateway reported failure");
                }
            }
        } catch (error) {
            console.error("[CHECKOUT-DRAFT] Settlement after check-status failed:", error);
        }
    } catch (error: any) {
        res.status(500).json({ error: "Failed to check transaction status" });
    }
});

/**
 * @swagger
 * /api/payments/response:
 *   get:
 *     summary: Payment gateway response redirect handler
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: MerchantTxnId
 *         required: true
 *         schema:
 *           type: string
 *         description: Merchant transaction ID returned by the gateway
 *       - in: query
 *         name: GatewayTxnId
 *         required: true
 *         schema:
 *           type: string
 *         description: Gateway transaction ID
 *     responses:
 *       302:
 *         description: Redirects to frontend with transaction details
 */
// Response URL handler
paymentRouter.get("/response", (req: Request, res: Response) => {
    const { MerchantTxnId, GatewayTxnId } = req.query;

    res.redirect(
        `${config.FRONTEND_URL}/order/payment-response?MerchantTxnId=${MerchantTxnId}&GatewayTxnId=${GatewayTxnId}`,
    );
});

/**
 * @swagger
 * /api/payments/notification:
 *   get:
 *     summary: Payment gateway webhook notification handler
 *     description: Receives payment status callbacks from Nepal Payment Gateway and updates order status accordingly.
 *     tags: [Payments]
 *     parameters:
 *       - in: query
 *         name: MerchantTxnId
 *         required: true
 *         schema:
 *           type: string
 *         description: Merchant transaction ID
 *       - in: query
 *         name: GatewayTxnId
 *         schema:
 *           type: string
 *         description: Gateway transaction ID
 *       - in: query
 *         name: Status
 *         schema:
 *           type: string
 *           enum: [SUCCESS, FAILED, CANCELLED]
 *         description: Payment status from the gateway
 *     responses:
 *       200:
 *         description: Notification received and processed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *       400:
 *         description: Invalid or missing MerchantTxnId
 *       404:
 *         description: Order not found
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
paymentRouter.get("/notification", async (req: Request, res: Response) => {
    try {
        const { MerchantTxnId, GatewayTxnId, Status } = req.query;

        if (!MerchantTxnId || typeof MerchantTxnId !== "string") {
            throw new APIError(400, "Invalid or missing MerchantTxnId");
        }

        const order = await orderDb.findOne({
            where: { mTransactionId: MerchantTxnId },
            relations: ["orderItems", "orderItems.product", "orderItems.variant"],
        });

        if (!order) {
            // Draft-based checkout: materialize or cancel the draft instead.
            const draft = await draftDb.findOne({
                where: { mTransactionId: MerchantTxnId },
            });
            if (draft) {
                if (draft.status === CheckoutDraftStatus.PENDING) {
                    const orderService = new OrderService();
                    const statusUpper = String(Status || "").toUpperCase();
                    if (statusUpper === "SUCCESS") {
                        await orderService.materializeDraftOrder(draft, MerchantTxnId);
                    } else if (statusUpper === "FAILED" || statusUpper === "CANCELLED") {
                        await orderService.cancelCheckoutDraft(draft, "Gateway notification");
                    }
                }
                res.send("received");
                return;
            }
            throw new APIError(404, "Order not found");
        }

        const userId = order.orderedById;
        const cartService = new CartService();
        const notificationService = new NotificationService();

        switch ((Status as string).toUpperCase()) {
            case "SUCCESS":
                order.paymentStatus = PaymentStatus.PAID;
                order.status = OrderStatus.CONFIRMED;
                await cartService.clearCart(userId);
                await orderDb.save(order);
                await notificationService.notifyPaymentSuccess(
                    order.id,
                    userId,
                );
                break;

            case "FAILED":
            case "CANCELLED": {
                // Idempotency guard: skip stock restore if already terminal
                const alreadyTerminal =
                    order.status === OrderStatus.CANCELLED ||
                    order.deliveryStatus === DeliveryStatus.DELIVERY_FAILED;

                if (!alreadyTerminal) {
                    // Restore stock for each item
                    for (const item of order.orderItems) {
                        if (item.variant) {
                            item.variant.stockReserved = Math.max(
                                0,
                                (item.variant.stockReserved || 0) - item.quantity,
                            );
                            item.variant.stock += item.quantity;
                            await AppDataSource.getRepository(Variant).save(item.variant);
                        } else if (item.product) {
                            item.product.stockReserved = Math.max(
                                0,
                                (item.product.stockReserved || 0) - item.quantity,
                            );
                            item.product.stock += item.quantity;
                            await AppDataSource.getRepository(Product).save(item.product);
                        }
                    }
                }

                order.paymentStatus = PaymentStatus.UNPAID;
                order.status = OrderStatus.CANCELLED;
                order.deliveryStatus = DeliveryStatus.DELIVERY_FAILED;
                await orderDb.save(order);

                if (!alreadyTerminal) {
                    await notificationService.notifyPaymentFailed(order.id, userId);
                }
                break;
            }

            default:
                break;
        }

        res.send("received");
    } catch (error) {
        if (error instanceof APIError) {
            res.status(error.status).json({
                success: false,
                message: error.message,
            });
        } else {
            res.status(500).json({
                success: false,
                message: "Internal server error",
            });
        }
    }
});

export default paymentRouter;
