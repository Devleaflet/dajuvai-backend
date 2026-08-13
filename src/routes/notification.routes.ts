import { Router } from "express";
import { NotificationController } from "../controllers/notification.controller";
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
import { getNotificationsQuerySchema } from "../utils/zod_validations/notification.zod";

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
 *     summary: Get paginated notifications for the authenticated user, vendor, admin, or staff account
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1 }
 *         description: Page number. Defaults to 1.
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100 }
 *         description: Page size. Defaults to 25.
 *       - in: query
 *         name: unreadOnly
 *         schema: { type: boolean, default: false }
 *         description: Return only unread notifications while keeping unreadTotal for the account.
 *     responses:
 *       200:
 *         description: Successfully fetched all notifications for the authenticated entity
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotificationListResponse'
 *       401:
 *         description: Unauthorized, user or vendor not authenticated
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
 *                   example: "Error message describing what went wrong"
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
 *                   example: "Error message describing what went wrong"
 */
notificationRoutes.get(
  "/",
  combinedAuthMiddleware,
  validateZod(getNotificationsQuerySchema, "query"),
  controller.getNotificationController.bind(controller),
);

/**
 * @swagger
 * /api/notification/read-all:
 *   patch:
 *     summary: Mark all accessible notifications as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Number of notifications marked as read.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: object
 *                   properties:
 *                     updated: { type: integer, example: 12 }
 */
notificationRoutes.patch(
  "/read-all",
  combinedAuthMiddleware,
  controller.markAllReadController.bind(controller),
);

/**
 * @swagger
 * /api/notification/fcm-token:
 *   post:
 *     summary: Register or refresh an FCM device token for transactional push
 *     description: Call after every authenticated app launch, login, and FCM token refresh. Legacy token-only clients remain supported; modern clients should provide fcmToken, deviceId, and platform so multi-device delivery works.
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
 *                 description: Legacy alias for fcmToken.
 *                 example: "fxyz123..."
 *               fcmToken:
 *                 type: string
 *                 example: "fxyz123..."
 *               deviceId:
 *                 type: string
 *                 example: "android-install-8f28"
 *               platform:
 *                 type: string
 *                 enum: [android, ios, web]
 *               appVersion:
 *                 type: string
 *               deviceModel:
 *                 type: string
 *               osVersion:
 *                 type: string
 *     responses:
 *       200:
 *         description: FCM token saved successfully
 *         content:
 *           application/json:
 *             example: { success: true, msg: "FCM token saved" }
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
 *                   example: "Error message describing what went wrong"
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
 *         content:
 *           application/json:
 *             example: { success: true, msg: "Device unregistered" }
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
 *                   example: "Error message describing what went wrong"
 *       404:
 *         description: Device not found
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
 *                   example: "Device not found"
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
 *               title: { type: string, minLength: 1, maxLength: 200, example: "Flash sale" }
 *               body: { type: string, minLength: 1, maxLength: 1000, example: "50% off today only" }
 *               imageUrl: { type: string, format: uri }
 *               data:
 *                 type: object
 *                 additionalProperties: { type: string }
 *               priority: { type: string, enum: [high, normal], default: high }
 *     responses:
 *       200:
 *         description: Dispatch record with success/failure counts
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Notification dispatched"
 *               data: { dispatchId: 17, status: "sent", successCount: 1, failureCount: 0 }
 *       400:
 *         description: Validation failed
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
 *                   example: "Validation failed"
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
 *                   example: "Error message describing what went wrong"
 *       403:
 *         description: Not an admin or staff
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
 *                   example: "Admin or staff access required"
 *       429:
 *         description: Rate limit exceeded
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
 *                   example: "Too many requests, please try again later"
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
 *               title: { type: string, minLength: 1, maxLength: 200 }
 *               body: { type: string, minLength: 1, maxLength: 1000 }
 *               imageUrl: { type: string, format: uri }
 *               data:
 *                 type: object
 *                 additionalProperties: { type: string }
 *               priority: { type: string, enum: [high, normal], default: high }
 *     responses:
 *       200:
 *         description: Dispatch record with success/failure counts
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Notification dispatched"
 *               data: { dispatchId: 18, status: "partial", successCount: 98, failureCount: 2 }
 *       429:
 *         description: Rate limit exceeded (10/min)
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
 *                   example: "Rate limit exceeded"
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
 *               title: { type: string, minLength: 1, maxLength: 200 }
 *               body: { type: string, minLength: 1, maxLength: 1000 }
 *               imageUrl: { type: string, format: uri }
 *               data:
 *                 type: object
 *                 additionalProperties: { type: string }
 *               priority: { type: string, enum: [high, normal], default: high }
 *     responses:
 *       200:
 *         description: Dispatch accepted by FCM. Per-device counts are not available for topics.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Topic notification dispatched"
 *               data: { dispatchId: 19, status: "sent" }
 *       429:
 *         description: Rate limit exceeded (5/min)
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
 *                   example: "Rate limit exceeded"
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
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data: [{ id: 17, type: "single", status: "sent", createdAt: "2026-07-29T10:30:00.000Z" }]
 *               page: 1
 *               limit: 20
 *               total: 1
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
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data: { activeDevices: 42, totalDispatches: 17, successRate: 98.5 }
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
 *     security:
 *       - bearerAuth: []
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
 *                   $ref: '#/components/schemas/Notification'
 *       404:
 *         description: Notification not found
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
 *                   example: "Notification not found"
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
 *                   example: "Error message describing what went wrong"
 */
notificationRoutes.get(
  "/:id",
  combinedAuthMiddleware,
  controller.getNotificationByIdController.bind(controller),
);

/**
 * @swagger
 * /api/notification/{id}:
 *   patch:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     description: Marks notification as read. Request body is not required; server always sets isRead to true after access check.
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
 *                   example: "Notification not found"
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
 *                   example: "Error message describing what went wrong"
 */
notificationRoutes.patch(
  "/:id",
  combinedAuthMiddleware,
  controller.markReadController.bind(controller),
);

export default notificationRoutes;
