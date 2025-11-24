import { Router } from "express";
import { NotificationController } from '../controllers/notification.controller';
import { combinedAuthMiddleware } from "../middlewares/auth.middleware";

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
notificationRoutes.get("/:id", controller.getNotificationByIdController.bind(controller));



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
notificationRoutes.patch("/:id", controller.markReadController.bind(controller));

export default notificationRoutes;
