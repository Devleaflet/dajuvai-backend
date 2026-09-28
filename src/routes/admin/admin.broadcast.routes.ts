import { Router } from "express";
import { AdminBroadcastController } from "../../controllers/admin.broadcast.controller";
import { authMiddleware, isAdmin, validateZod } from "../../middlewares/auth.middleware";
import { broadcastLimiter, generalNotificationLimiter, readLimiter } from "../../middlewares/pushRateLimiter.middleware";
import {
    broadcastDeliveriesQuerySchema,
    broadcastIdParamSchema,
    broadcastListQuerySchema,
    createBroadcastSchema,
    previewBroadcastSchema,
    recipientSearchQuerySchema,
    sendBroadcastSchema,
    targetSearchQuerySchema,
    testBroadcastSchema,
    updateBroadcastSchema,
} from "../../utils/zod_validations/broadcast.zod";

// Admin only, not staff: one send reaches every customer and vendor.
const adminBroadcastRouter = Router();
const controller = new AdminBroadcastController();
const admin = [authMiddleware, isAdmin];
const byId = validateZod(broadcastIdParamSchema, "params");
// Sending and testing reach people, so they get the tight limiter; editing
// drafts only touches the database.
const editLimiter = generalNotificationLimiter;

/**
 * @swagger
 * components:
 *   schemas:
 *     BroadcastInput:
 *       type: object
 *       required: [name, audienceType, channels, title, body]
 *       properties:
 *         name: { type: string, maxLength: 200, example: "Dashain sale" }
 *         audienceType: { type: string, enum: [ALL_USERS, ALL_VENDORS, ALL_USERS_AND_VENDORS, SELECTED_USERS, SELECTED_VENDORS] }
 *         selectedUserIds: { type: array, items: { type: integer }, nullable: true, description: "Required for SELECTED_USERS." }
 *         selectedVendorIds: { type: array, items: { type: integer }, nullable: true, description: "Required for SELECTED_VENDORS." }
 *         channels: { type: array, items: { type: string, enum: [FCM, EMAIL, IN_APP] }, minItems: 1 }
 *         title: { type: string, maxLength: 200 }
 *         body: { type: string, maxLength: 2000, description: "Plain text; line breaks are kept." }
 *         emailSubject: { type: string, nullable: true, description: "Defaults to the title." }
 *         imageUrl: { type: string, format: uri, nullable: true, description: "https only." }
 *         actionType: { type: string, enum: [NONE, OPEN_PRODUCT, OPEN_STORE, OPEN_DEALS, OPEN_URL, OPEN_CATEGORY, OPEN_SUBCATEGORY], default: NONE }
 *         actionValue: { type: string, nullable: true, description: "Product, store, category or subcategory id/slug (stored as the id), or an http(s) URL." }
 *     Broadcast:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         name: { type: string }
 *         status: { type: string, enum: [DRAFT, QUEUED, PROCESSING, COMPLETED, PARTIALLY_COMPLETED, FAILED, CANCELLED] }
 *         audienceType: { type: string }
 *         channels: { type: array, items: { type: string } }
 *         selectedUserIds: { type: array, items: { type: integer }, nullable: true }
 *         selectedVendorIds: { type: array, items: { type: integer }, nullable: true }
 *         title: { type: string }
 *         body: { type: string }
 *         emailSubject: { type: string, nullable: true }
 *         imageUrl: { type: string, nullable: true }
 *         actionType: { type: string }
 *         actionValue: { type: string, nullable: true }
 *         scheduledAt: { type: string, format: date-time, nullable: true }
 *         startedAt: { type: string, format: date-time, nullable: true }
 *         completedAt: { type: string, format: date-time, nullable: true }
 *         totalRecipients: { type: integer }
 *         sentCount: { type: integer }
 *         failedCount: { type: integer }
 *         skippedCount: { type: integer }
 *         createdBy: { type: object, properties: { id: { type: integer }, name: { type: string, nullable: true } } }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */

/**
 * @swagger
 * /api/admin/broadcasts/availability:
 *   get:
 *     summary: Whether broadcasts can be sent right now
 *     description: Reports the BROADCAST_ENABLED flag, Redis queue health and dry-run mode, with a reason when sending is unavailable.
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Availability.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     enabled: { type: boolean }
 *                     queueReady: { type: boolean }
 *                     dryRun: { type: boolean }
 *                     canSend: { type: boolean }
 *                     reason: { type: string, nullable: true }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 */
adminBroadcastRouter.get("/availability", ...admin, readLimiter, controller.availability.bind(controller));

/**
 * @swagger
 * /api/admin/broadcasts/recipients:
 *   get:
 *     summary: Search customers or vendors to pick as recipients
 *     description: Every word must match the name, username, email, district (vendors) or id; digits also match the phone number. Exact email, phone or id matches rank first. With all=1, returns every matching id (up to 5000) for "select all matching".
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: kind, required: true, schema: { type: string, enum: [user, vendor] } }
 *       - { in: query, name: q, schema: { type: string } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 25 } }
 *       - { in: query, name: ids, schema: { type: string }, description: Comma-separated ids to restrict to, e.g. to label a saved selection. }
 *       - { in: query, name: all, schema: { type: string, enum: ["0", "1"], default: "0" } }
 *     responses:
 *       200:
 *         description: A page of people, or with all=1 the matching ids.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       name: { type: string, nullable: true }
 *                       email: { type: string, nullable: true }
 *                       phone: { type: string, nullable: true }
 *                       detail: { type: string, nullable: true }
 *                       verified: { type: boolean }
 *                       emailOptIn: { type: boolean }
 *                       hasDevice: { type: boolean }
 *                       createdAt: { type: string, format: date-time }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *                 totalPages: { type: integer }
 *                 ids: { type: array, items: { type: integer } }
 *                 truncated: { type: boolean }
 *       400: { description: Validation failed. }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 */
adminBroadcastRouter.get("/recipients", ...admin, readLimiter, validateZod(recipientSearchQuerySchema, "query"), controller.recipients.bind(controller));

/**
 * @swagger
 * /api/admin/broadcasts/targets:
 *   get:
 *     summary: Search what a broadcast can open
 *     description: Live products from approved stores, approved stores, categories or subcategories, by name, slug or id.
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: type, required: true, schema: { type: string, enum: [product, store, category, subcategory] } }
 *       - { in: query, name: q, schema: { type: string } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 50, default: 20 } }
 *       - { in: query, name: ids, schema: { type: string }, description: Comma-separated ids to restrict to. }
 *     responses:
 *       200:
 *         description: Matches.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: integer }
 *                       label: { type: string }
 *                       detail: { type: string, nullable: true }
 *                       imageUrl: { type: string, nullable: true }
 *                       price: { type: number, nullable: true }
 *       400: { description: Validation failed. }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 */
adminBroadcastRouter.get("/targets", ...admin, readLimiter, validateZod(targetSearchQuerySchema, "query"), controller.targets.bind(controller));

/**
 * @swagger
 * /api/admin/broadcasts/preview:
 *   post:
 *     summary: Count who an audience reaches, per channel
 *     description: Resolves the audience exactly as a send would (verified customers, approved vendors, nobody mid-deletion) and counts who each channel can reach.
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [audienceType]
 *             properties:
 *               audienceType: { type: string, enum: [ALL_USERS, ALL_VENDORS, ALL_USERS_AND_VENDORS, SELECTED_USERS, SELECTED_VENDORS] }
 *               selectedUserIds: { type: array, items: { type: integer } }
 *               selectedVendorIds: { type: array, items: { type: integer } }
 *     responses:
 *       200:
 *         description: Audience size. `reachable` counts people with an email (and not unsubscribed), with a registered device, and everyone for in-app.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     users: { type: integer }
 *                     vendors: { type: integer }
 *                     total: { type: integer }
 *                     reachable:
 *                       type: object
 *                       properties:
 *                         FCM: { type: integer }
 *                         EMAIL: { type: integer }
 *                         IN_APP: { type: integer }
 *       400: { description: Validation failed. }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 */
adminBroadcastRouter.post("/preview", ...admin, readLimiter, validateZod(previewBroadcastSchema), controller.preview.bind(controller));

/**
 * @swagger
 * /api/admin/broadcasts:
 *   get:
 *     summary: List broadcasts, newest first
 *     description: Paginated broadcasts with their message and result counters. Counters are final once a broadcast settles; use the detail endpoint for live progress.
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: status, schema: { type: string, enum: [DRAFT, QUEUED, PROCESSING, COMPLETED, PARTIALLY_COMPLETED, FAILED, CANCELLED] } }
 *       - { in: query, name: search, schema: { type: string }, description: Matches the broadcast name. }
 *     responses:
 *       200:
 *         description: A page of broadcasts.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: array, items: { $ref: '#/components/schemas/Broadcast' } }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *                 totalPages: { type: integer }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 *   post:
 *     summary: Create a draft broadcast
 *     description: Saves a draft. One message is shared by every chosen channel; email may override the subject. Nothing is sent until the send endpoint is called.
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BroadcastInput' }
 *     responses:
 *       201:
 *         description: The draft.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Broadcast' }
 *       400: { description: Validation failed, or the product/store action does not exist. }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 */
adminBroadcastRouter.get("/", ...admin, readLimiter, validateZod(broadcastListQuerySchema, "query"), controller.list.bind(controller));
adminBroadcastRouter.post("/", ...admin, editLimiter, validateZod(createBroadcastSchema), controller.create.bind(controller));

/**
 * @swagger
 * /api/admin/broadcasts/{id}:
 *   get:
 *     summary: One broadcast, with per-channel delivery counts
 *     description: The broadcast, its message, who created it, the named hand-picked recipients, and live delivery counts per channel.
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: The broadcast. `stats` maps each channel to counts by delivery status; `selectedUsers`/`selectedVendors` name up to 200 hand-picked recipients.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Broadcast' }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 *       404: { description: No such broadcast. }
 *   put:
 *     summary: Replace a draft's contents
 *     description: Replaces every field of a draft. Sent broadcasts cannot be edited; duplicate them instead.
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/BroadcastInput' }
 *     responses:
 *       200:
 *         description: The updated draft.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Broadcast' }
 *       400: { description: Validation failed. }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 *       404: { description: No such broadcast. }
 *       409: { description: The broadcast is no longer a draft. }
 *   delete:
 *     summary: Delete a draft
 *     description: Deletes a draft. Broadcasts that were queued or sent are kept as a record.
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: Deleted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { type: object, properties: { deleted: { type: boolean } } }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 *       404: { description: No such broadcast. }
 *       409: { description: Sent broadcasts are kept as a record. }
 */
adminBroadcastRouter.get("/:id", ...admin, readLimiter, byId, controller.get.bind(controller));
adminBroadcastRouter.put("/:id", ...admin, editLimiter, byId, validateZod(updateBroadcastSchema), controller.update.bind(controller));
adminBroadcastRouter.delete("/:id", ...admin, editLimiter, byId, controller.remove.bind(controller));

/**
 * @swagger
 * /api/admin/broadcasts/{id}/deliveries:
 *   get:
 *     summary: Per-recipient delivery results
 *     description: One row per recipient and channel, with the outcome and, for skips and failures, the reason.
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: channel, schema: { type: string, enum: [FCM, EMAIL, IN_APP] } }
 *       - { in: query, name: status, schema: { type: string, enum: [PENDING, PROCESSING, SENT, FAILED, SKIPPED] } }
 *     responses:
 *       200:
 *         description: A page of deliveries.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, format: uuid }
 *                       channel: { type: string }
 *                       status: { type: string }
 *                       errorMessage: { type: string, nullable: true }
 *                       attemptCount: { type: integer }
 *                       sentAt: { type: string, format: date-time, nullable: true }
 *                       failedAt: { type: string, format: date-time, nullable: true }
 *                       recipientType: { type: string, enum: [USER, VENDOR] }
 *                       userId: { type: integer, nullable: true }
 *                       vendorId: { type: integer, nullable: true }
 *                       email: { type: string, nullable: true }
 *                       name: { type: string, nullable: true }
 *                 total: { type: integer }
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *                 totalPages: { type: integer }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 *       404: { description: No such broadcast. }
 */
adminBroadcastRouter.get("/:id/deliveries", ...admin, readLimiter, byId, validateZod(broadcastDeliveriesQuerySchema, "query"), controller.deliveries.bind(controller));

/**
 * @swagger
 * /api/admin/broadcasts/{id}/send:
 *   post:
 *     summary: Send a draft now, or schedule it
 *     description: Queues the broadcast. The audience is resolved when it starts, not when it is scheduled.
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               scheduledAt: { type: string, format: date-time, nullable: true, description: "Omit to send now; up to 60 days ahead." }
 *     responses:
 *       200:
 *         description: The queued broadcast.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Broadcast' }
 *       400: { description: The time has passed, is too far ahead, or the audience is empty. }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 *       404: { description: No such broadcast. }
 *       409: { description: Already sent. }
 *       503: { description: Broadcasts are disabled or the queue is unreachable. }
 */
adminBroadcastRouter.post("/:id/send", ...admin, broadcastLimiter, byId, validateZod(sendBroadcastSchema), controller.send.bind(controller));

/**
 * @swagger
 * /api/admin/broadcasts/{id}/cancel:
 *   post:
 *     summary: Unschedule a queued broadcast, or stop one that is sending
 *     description: A broadcast that has not started returns to DRAFT (outcome UNSCHEDULED). One that is sending becomes CANCELLED (outcome STOPPED); messages already sent stay sent.
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       200:
 *         description: What happened.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     outcome: { type: string, enum: [UNSCHEDULED, STOPPED] }
 *                     broadcast: { $ref: '#/components/schemas/Broadcast' }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 *       404: { description: No such broadcast. }
 *       409: { description: The broadcast has finished, or is a draft. }
 */
adminBroadcastRouter.post("/:id/cancel", ...admin, editLimiter, byId, controller.cancel.bind(controller));

/**
 * @swagger
 * /api/admin/broadcasts/{id}/duplicate:
 *   post:
 *     summary: Copy any broadcast into a new draft
 *     description: Creates a new draft with the same audience and message, named "Copy of …".
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     responses:
 *       201:
 *         description: The new draft.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data: { $ref: '#/components/schemas/Broadcast' }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 *       404: { description: No such broadcast. }
 */
adminBroadcastRouter.post("/:id/duplicate", ...admin, editLimiter, byId, controller.duplicate.bind(controller));

/**
 * @swagger
 * /api/admin/broadcasts/{id}/test:
 *   post:
 *     summary: Send the message to one recipient immediately
 *     description: Bypasses the queue. With no userId or vendorId, sends to the calling admin's email and devices.
 *     tags: [Admin Broadcasts]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId: { type: integer }
 *               vendorId: { type: integer }
 *     responses:
 *       200:
 *         description: One result per channel.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           channel: { type: string }
 *                           status: { type: string, enum: [SENT, SKIPPED, FAILED] }
 *                           detail: { type: string, nullable: true }
 *       400: { description: Validation failed. }
 *       401: { description: Authentication required. }
 *       403: { description: Admin role required. }
 *       404: { description: No such broadcast or recipient. }
 */
adminBroadcastRouter.post("/:id/test", ...admin, broadcastLimiter, byId, validateZod(testBroadcastSchema), controller.test.bind(controller));

export default adminBroadcastRouter;
