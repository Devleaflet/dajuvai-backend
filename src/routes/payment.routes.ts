import { Request, Response } from "express";
import crypto from "crypto";
import axios from "axios";
import { Router } from "express";
import { DeliveryStatus, Order, OrderStatus, PaymentStatus } from "../entities/order.entity";
import { Variant } from "../entities/variant.entity";
import { Product } from "../entities/product.entity";
import { CheckoutDraft, CheckoutDraftStatus } from "../entities/checkoutDraft.entity";
import { WebhookProvider } from "../entities/processedWebhook.entity";
import {
    claimWebhookEvent,
    linkWebhookEventToOrder,
    webhookEventId,
} from "../service/webhook-dedupe.service";
import AppDataSource from "../config/db.config";
import config from "../config/env.config";
import { APIError } from "../utils/ApiError.utils";
import { AuthRequest, authMiddleware } from "../middlewares/auth.middleware";
import { sameAmount } from "../utils/esewa.util";
import { CartService } from "../service/cart.service";
import { NotificationService } from "../service/notification.service";
import { OrderService } from "../service/order.service";
import {
    NPS_CONFIG,
    NpsPaymentService,
    NpsTransactionStatus,
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

/**
 * Settles a pending draft on the gateway's own verdict.
 *
 * Only the gateway's `CheckTransactionStatus` answer is trusted — never a
 * status in a query string or request body — and a success is honoured only
 * when the amount the gateway collected is the amount the draft was priced
 * at. Returns quietly on anything else; the draft stays pending for the next
 * notification or poll.
 */
async function settleDraftFromGateway(
    draft: CheckoutDraft,
    merchantTxnId: string,
    verdict: { status: NpsTransactionStatus; raw: any },
): Promise<void> {
    if (draft.status !== CheckoutDraftStatus.PENDING) return;
    const orderService = new OrderService();
    if (verdict.status === "Success") {
        const collected = verdict.raw?.data?.Amount;
        if (!sameAmount(collected, draft.totals?.totalPrice ?? NaN)) {
            console.error(
                `[NPX] Amount mismatch for draft ${draft.id}: gateway collected ${collected}, draft total ${draft.totals?.totalPrice}`,
            );
            return;
        }
        await orderService.materializeDraftOrder(draft, merchantTxnId);
    } else if (verdict.status === "Failed") {
        await orderService.cancelCheckoutDraft(draft, "Gateway reported failure");
    }
}

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
// Signs a request with the merchant secret, so it is not an open service.
paymentRouter.post("/process-id", authMiddleware, async (req: Request, res: Response) => {
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
paymentRouter.post("/initiate-payment", authMiddleware, async (req: AuthRequest<{}, {}, Record<string, any>>, res: Response) => {
    try {
        const callerId = req.user!.id;
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

        // Everything about the request is checked before the gateway is
        // contacted; `persist` records the transaction once it exists.
        let persist: () => Promise<unknown>;

        if (hasDraftId) {
            // Draft-based checkout: no order exists yet — it materializes
            // only after the gateway confirms success.
            const draft = await draftDb.findOne({ where: { id: Number(draftId) } });
            if (!draft || draft.status !== CheckoutDraftStatus.PENDING || draft.userId !== callerId) {
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

            persist = () => {
                draft.mTransactionId = merchantTxnId;
                if (draft.payload) {
                    draft.payload = { ...draft.payload, instrumentName: instrumentCode || null };
                }
                return draftDb.save(draft);
            };
        } else {
            const order = await orderDb.findOne({ where: { id: Number(orderId) } });
            if (!order) {
                throw new APIError(404, "Order not found");
            }
            // Ownership before anything else: otherwise re-initiating a
            // stranger's order overwrote its transaction id (orphaning the
            // payment they made), and the amount check below answered
            // "does order N cost X?" for anyone.
            if (order.orderedById !== callerId) {
                throw new APIError(404, "Order not found");
            }

            /**
             * Never trust the client-provided amount over the stored order.
             *
             * The draft branch above has always done this; the order branch did
             * not, so a caller who knew any order id could initiate a payment
             * for any amount they liked — Rs 1 against a Rs 90,000 order — and
             * the gateway would report a successful payment against it.
             *
             * `finalTotal` is what is payable once cancelled lines are removed;
             * it falls back to `totalPrice` for rows written before that column.
             * A paisa of tolerance absorbs the decimal-to-float round trip.
             */
            const payable = Number(
                (order as { finalTotal?: string | number | null }).finalTotal ??
                    order.totalPrice,
            );
            if (
                !Number.isFinite(payable) ||
                Math.abs(payable - Number(amount)) > 0.01
            ) {
                throw new APIError(
                    400,
                    "Payment amount does not match the order total",
                );
            }

            // An order that is already paid must not be paid again, and one
            // that was cancelled must not be payable at all.
            if (order.paymentStatus === PaymentStatus.PAID) {
                throw new APIError(409, "This order has already been paid");
            }
            if (order.status === OrderStatus.CANCELLED) {
                throw new APIError(409, "This order was cancelled");
            }


            persist = () => {
                // Update order with merchant transaction info
                order.mTransactionId = merchantTxnId;
                order.instrumentName = instrumentCode;
                return orderDb.save(order);
            };
        }

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

        await persist();

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
paymentRouter.post("/check-status", authMiddleware, async (req: AuthRequest, res: Response) => {
    try {
        const { merchantTxnId } = req.body as { merchantTxnId?: unknown };
        if (typeof merchantTxnId !== "string" || !merchantTxnId) {
            res.status(400).json({ success: false, errorCode: "VALIDATION_ERROR", message: "merchantTxnId is required" });
            return;
        }

        // A transaction id is not a secret — it is in the payment URL — so
        // it only answers for the account that started the payment.
        const callerId = req.user!.id;
        const [draft, order] = await Promise.all([
            draftDb.findOne({ where: { mTransactionId: merchantTxnId, userId: callerId } }),
            orderDb.findOne({ where: { mTransactionId: merchantTxnId, orderedById: callerId } }),
        ]);
        if (!draft && !order) {
            res.status(404).json({ success: false, message: "Transaction not found" });
            return;
        }

        const verdict = await new NpsPaymentService().checkTransactionStatus(merchantTxnId);
        if (!verdict.raw) {
            res.status(502).json({ error: "Failed to check transaction status" });
            return;
        }
        res.json(verdict.raw);

        // Response is already sent — settlement failures here only log.
        if (draft) {
            await settleDraftFromGateway(draft, merchantTxnId, verdict).catch((error) =>
                console.error("[CHECKOUT-DRAFT] Settlement after check-status failed:", error),
            );
        }
    } catch (error: any) {
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to check transaction status" });
        }
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
        const { MerchantTxnId, GatewayTxnId } = req.query;

        if (!MerchantTxnId || typeof MerchantTxnId !== "string") {
            throw new APIError(400, "Invalid or missing MerchantTxnId");
        }

        /**
         * The notification is a prompt to look, not a verdict.
         *
         * This URL is public and unsigned, so a `Status=SUCCESS` in its query
         * string is whatever the caller typed: trusting it let anyone mark
         * their own unpaid order paid, or cancel someone else's. The outcome
         * is taken from the gateway itself, over our authenticated API, along
         * with the amount it actually collected.
         */
        const verdict = await new NpsPaymentService().checkTransactionStatus(MerchantTxnId);
        const Status =
            verdict.status === "Success" ? "SUCCESS" : verdict.status === "Failed" ? "FAILED" : null;
        if (!Status) {
            // Pending or unreachable: nothing to act on yet. The gateway
            // notifies again, and the shopper's status poll settles it too.
            res.send("received");
            return;
        }

        /**
         * Claim the event before acting on it.
         *
         * NPS delivers at least once: a slow response here, a network blip or a
         * manual replay all produce a second copy of a notification we have
         * already handled. The cancellation branch below has always been guarded
         * by a conditional UPDATE; the success branch was not, so a duplicate
         * re-cleared the cart and sent a second "payment received" notification.
         *
         * The insert is the guard. Two simultaneous deliveries both pass a
         * read-then-act check; only one can insert the unique
         * `(provider, eventId)` row, and that one owns the side effects. A
         * duplicate answers the gateway with success and stops — anything else
         * only earns a third delivery.
         */
        const eventId = webhookEventId({
            merchantTxnId: MerchantTxnId,
            status: Status,
            gatewayTxnId: typeof GatewayTxnId === "string" ? GatewayTxnId : null,
        });

        const claimed = await claimWebhookEvent({
            provider: WebhookProvider.NPX,
            eventId,
            payload: { MerchantTxnId, GatewayTxnId, Status },
        });

        if (!claimed) {
            console.log(
                JSON.stringify({
                    level: "info",
                    event: "webhook.duplicate_ignored",
                    provider: WebhookProvider.NPX,
                    eventId,
                }),
            );
            res.send("received");
            return;
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
                await settleDraftFromGateway(draft, MerchantTxnId, verdict);
                res.send("received");
                return;
            }
            throw new APIError(404, "Order not found");
        }

        await linkWebhookEventToOrder(WebhookProvider.NPX, eventId, order.id);

        const userId = order.orderedById;
        const cartService = new CartService();
        const notificationService = new NotificationService();

        switch (Status) {
            case "SUCCESS": {
                const collected = verdict.raw?.data?.Amount;
                const payable = (order as { finalTotal?: string | number | null }).finalTotal ?? order.totalPrice;
                if (!sameAmount(collected, payable)) {
                    console.error(
                        `[NPX] Amount mismatch for order ${order.id}: gateway collected ${collected}, payable ${payable}`,
                    );
                    break;
                }
                order.paymentStatus = PaymentStatus.PAID;
                order.status = OrderStatus.CONFIRMED;
                await cartService.clearCart(userId);
                await orderDb.save(order);
                await notificationService.notifyPaymentSuccess(
                    order.id,
                    userId,
                );
                break;
            }

            case "FAILED": {
                // Idempotency guard. This has to be decided by the database,
                // not by the `order` row read at the top of the request: a
                // gateway that retries its notification can deliver twice, and
                // two handlers reading the same pre-cancelled row would both
                // restore the stock and both release the promo. The conditional
                // UPDATE lets exactly one of them through — whoever changes a
                // row owns the side effects.
                const cancellation = await orderDb
                    .createQueryBuilder()
                    .update(Order)
                    .set({
                        paymentStatus: PaymentStatus.UNPAID,
                        status: OrderStatus.CANCELLED,
                        deliveryStatus: DeliveryStatus.DELIVERY_FAILED,
                    })
                    .where("id = :id", { id: order.id })
                    .andWhere("status != :cancelled", {
                        cancelled: OrderStatus.CANCELLED,
                    })
                    .andWhere("\"deliveryStatus\" != :failed", {
                        failed: DeliveryStatus.DELIVERY_FAILED,
                    })
                    .execute();

                const alreadyTerminal = (cancellation.affected ?? 0) === 0;

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

                // Kept in step with what the UPDATE above wrote, since the
                // notification service below reads from this instance.
                order.paymentStatus = PaymentStatus.UNPAID;
                order.status = OrderStatus.CANCELLED;
                order.deliveryStatus = DeliveryStatus.DELIVERY_FAILED;

                if (!alreadyTerminal) {
                    // Give the promo slot back, as every other cancellation
                    // path does. Without this the customer keeps paying for a
                    // purchase the gateway refused: the redemption row stays
                    // and their one allowance is gone for good.
                    await new OrderService()
                        .releasePromoUsage(order.appliedPromoCode, order.id)
                        .catch((err) =>
                            console.error(
                                `Failed to release promo for order ${order.id}:`,
                                err,
                            ),
                        );

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
