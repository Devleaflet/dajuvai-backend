import { Router } from 'express';
import { authMiddleware, isAdminOrStaff } from '../../middlewares/auth.middleware';
import { AdminOrdersController } from '../../controllers/admin.orders.controller';

const adminOrdersController = new AdminOrdersController();
const adminOrdersRouter = Router();

/**
 * @swagger
 * /api/admin/orders/stats:
 *   get:
 *     summary: Get order page statistics
 *     description: |
 *       Returns aggregated statistics for the admin orders page:
 *       - Processing orders (PENDING, SHIPPED, CONFIRMED)
 *       - Completed orders in the last 30 days (DELIVERED)
 *       - Return/refund rate (RETURNED + CANCELLED as % of total)
 *     tags:
 *       - Admin Orders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Order page statistics fetched successfully
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
 *                     processingOrders:
 *                       type: integer
 *                       description: Number of in-flight orders (PENDING, SHIPPED, CONFIRMED)
 *                       example: 34
 *                     completedLast30Days:
 *                       type: integer
 *                       description: Number of DELIVERED orders in the past 30 days
 *                       example: 128
 *                     returnRefundRate:
 *                       type: object
 *                       properties:
 *                         rate:
 *                           type: string
 *                           description: Return/refund rate as a percentage string
 *                           example: "4.25"
 *                         returnedCancelled:
 *                           type: integer
 *                           description: Count of RETURNED or CANCELLED orders
 *                           example: 17
 *                         totalOrders:
 *                           type: integer
 *                           description: Total number of orders
 *                           example: 400
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *       403:
 *         description: Forbidden - Admin or Staff access required
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
 *                   example: "Error fetching order page stats"
 *                 error:
 *                   type: string
 *                   example: "Something went wrong"
 */
adminOrdersRouter.get(
    '/stats',
    authMiddleware,
    isAdminOrStaff,
    adminOrdersController.getOrderPageStats.bind(adminOrdersController)
);

export default adminOrdersRouter;
