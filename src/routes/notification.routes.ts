import { Router } from "express";
import { NotificationController } from '../controllers/notification.controller';
import {
    combinedAuthMiddleware,
    authMiddleware,
    isAdminOrStaff,
    validateZod,
} from "../middlewares/auth.middleware";
import {
    readLimiter,
    generalNotificationLimiter,
    multicastLimiter,
    broadcastLimiter,
    deviceRegistrationLimiter,
} from "../middlewares/pushRateLimiter.middleware";
import {
    sendToUserSchema,
    sendToUsersSchema,
    sendToTopicSchema,
    dispatchQuerySchema,
} from "../utils/zod_validations/push.zod";

const notificationRoutes = Router();
const controller = new NotificationController();

/**
 * @swagger
 * tags:
 *   name: Notifications
 *   description: API endpoints for managing user, vendor, and admin notifications
 */

/**
 * @swagger
 * /api/notification:
 *   get:
 *     summary: Get all notifications for the authenticated user or vendor
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully fetched all notifications for the authenticated entity
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
 *                         type: string
 *                         format: uuid
 *                         example: "8a52bc48-9d27-4b31-9a45-c30e76cfb4b2"
 *                       title:
 *                         type: string
 *                         example: "New Order Placed"
 *                       message:
 *                         type: string
 *                         example: "Order #123 has been placed by John Doe"
 *                       type:
 *                         type: string
 *                         enum: [ORDER_PLACED, ORDER_STATUS_UPDATED, GENERAL]
 *                       target:
 *                         type: string
 *                         enum: [ADMIN, VENDOR, USER]
 *                       isRead:
 *                         type: boolean
 *                         example: false
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized, user or vendor not authenticated
 *       500:
 *         description: Internal server error
 */
notificationRoutes.get("/", combinedAuthMiddleware, controller.getNotificationController.bind(controller));

/**
 * @swagger
 * /api/notification/fcm-token:
 *   post:
 *     summary: Save FCM device token for push notifications (called by Flutter app)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *             properties:
 *               token:
 *                 type: string
 *                 example: "fxyz123..."
 *     responses:
 *       200:
 *         description: FCM token saved successfully
 *       401:
 *         description: Unauthorized
 */
notificationRoutes.post(
    "/fcm-token",
    // Auth first: the limiter keys off req.user/req.vendor, which only exist
    // once an auth middleware has run. Reversed, it silently falls back to IP.
    combinedAuthMiddleware,
    deviceRegistrationLimiter,
    controller.saveFcmTokenController.bind(controller),
);

/**
 * @swagger
 * /api/notification/devices/{deviceId}:
 *   delete:
 *     summary: Unregister a device from push notifications (call on logout)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: deviceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Device unregistered
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Device not found
 */
notificationRoutes.delete(
    "/devices/:deviceId",
    combinedAuthMiddleware,
    deviceRegistrationLimiter,
    controller.removeFcmDeviceController.bind(controller),
);

// ── Admin push ───────────────────────────────────────────────────────────────
// These must stay above the "/:id" routes below — Express matches in order, and
// "/:id" would otherwise swallow "/admin/..." paths.

/**
 * @swagger
 * /api/notification/admin/send/user:
 *   post:
 *     summary: Send a push notification to one user's devices (admin only)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userId, title, body]
 *             properties:
 *               userId: { type: integer, example: 42 }
 *               title: { type: string, maxLength: 200, example: "Flash sale" }
 *               body: { type: string, maxLength: 1000, example: "50% off today only" }
 *               imageUrl: { type: string, format: uri }
 *               data:
 *                 type: object
 *                 additionalProperties: { type: string }
 *               priority: { type: string, enum: [high, normal], default: high }
 *     responses:
 *       200:
 *         description: Dispatch record with success/failure counts
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not an admin or staff
 *       429:
 *         description: Rate limit exceeded
 */
notificationRoutes.post(
    "/admin/send/user",
    authMiddleware,
    generalNotificationLimiter,
    isAdminOrStaff,
    validateZod(sendToUserSchema),
    controller.sendToUserController.bind(controller),
);

/**
 * @swagger
 * /api/notification/admin/send/multicast:
 *   post:
 *     summary: Send a push notification to many users at once (admin only)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds, title, body]
 *             properties:
 *               userIds:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 1000
 *                 items: { type: integer }
 *               title: { type: string, maxLength: 200 }
 *               body: { type: string, maxLength: 1000 }
 *               imageUrl: { type: string, format: uri }
 *               data:
 *                 type: object
 *                 additionalProperties: { type: string }
 *               priority: { type: string, enum: [high, normal], default: high }
 *     responses:
 *       200:
 *         description: Dispatch record with success/failure counts
 *       429:
 *         description: Rate limit exceeded (10/min)
 */
notificationRoutes.post(
    "/admin/send/multicast",
    authMiddleware,
    multicastLimiter,
    isAdminOrStaff,
    validateZod(sendToUsersSchema),
    controller.sendToUsersController.bind(controller),
);

/**
 * @swagger
 * /api/notification/admin/send/topic:
 *   post:
 *     summary: Broadcast a push notification to a Firebase topic (admin only)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [topic, title, body]
 *             properties:
 *               topic: { type: string, maxLength: 100, example: "all-users" }
 *               title: { type: string, maxLength: 200 }
 *               body: { type: string, maxLength: 1000 }
 *               imageUrl: { type: string, format: uri }
 *               data:
 *                 type: object
 *                 additionalProperties: { type: string }
 *               priority: { type: string, enum: [high, normal], default: high }
 *     responses:
 *       200:
 *         description: Dispatch accepted by FCM. Per-device counts are not available for topics.
 *       429:
 *         description: Rate limit exceeded (5/min)
 */
notificationRoutes.post(
    "/admin/send/topic",
    authMiddleware,
    broadcastLimiter,
    isAdminOrStaff,
    validateZod(sendToTopicSchema),
    controller.sendToTopicController.bind(controller),
);

/**
 * @swagger
 * /api/notification/admin/history:
 *   get:
 *     summary: Paginated history of admin push dispatches
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - { in: query, name: page, schema: { type: integer, minimum: 1, default: 1 } }
 *       - { in: query, name: limit, schema: { type: integer, minimum: 1, maximum: 100, default: 20 } }
 *       - { in: query, name: status, schema: { type: string, enum: [pending, sent, partial, failed] } }
 *       - { in: query, name: type, schema: { type: string, enum: [single, multicast, topic] } }
 *       - { in: query, name: targetUserId, schema: { type: integer } }
 *       - { in: query, name: sentBy, schema: { type: integer } }
 *       - { in: query, name: startDate, schema: { type: string, format: date-time } }
 *       - { in: query, name: endDate, schema: { type: string, format: date-time } }
 *     responses:
 *       200:
 *         description: Paginated dispatch records, newest first
 */
notificationRoutes.get(
    "/admin/history",
    authMiddleware,
    readLimiter,
    isAdminOrStaff,
    validateZod(dispatchQuerySchema, "query"),
    controller.getDispatchHistoryController.bind(controller),
);

/**
 * @swagger
 * /api/notification/admin/stats:
 *   get:
 *     summary: Push dashboard stats — active devices by platform, dispatch counts, success rate
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Combined device and dispatch statistics
 */
notificationRoutes.get(
    "/admin/stats",
    authMiddleware,
    readLimiter,
    isAdminOrStaff,
    controller.getPushStatsController.bind(controller),
);

/**
 * @swagger
 * /api/notification/{id}:
 *   get:
 *     summary: Get notification details by ID
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Notification ID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Successfully retrieved notification details
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
 *                       type: string
 *                       example: "bde21a84-8f3b-4e5d-b829-c431fd3e2342"
 *                     title:
 *                       type: string
 *                       example: "Order Status Updated"
 *                     message:
 *                       type: string
 *                       example: "Order #123 status updated to Shipped"
 *                     type:
 *                       type: string
 *                     target:
 *                       type: string
 *                     isRead:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Internal server error
 */
notificationRoutes.get("/:id", combinedAuthMiddleware, controller.getNotificationByIdController.bind(controller));



/**
 * @swagger
 * /api/notification/{id}:
 *   patch:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Notification ID
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Notification marked as read successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 msg:
 *                   type: string
 *                   example: "marked as read"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: "e67b01cc-44f7-458d-b88d-b9b4f31a1f67"
 *                     isRead:
 *                       type: boolean
 *                       example: true
 *       404:
 *         description: Notification not found
 *       500:
 *         description: Internal server error
 */
notificationRoutes.patch("/:id", combinedAuthMiddleware, controller.markReadController.bind(controller));

export default notificationRoutes;
