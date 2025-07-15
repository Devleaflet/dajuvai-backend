

import { Router } from "express";
import { authMiddleware, isAdmin, isAdminOrStaff } from "../middlewares/auth.middleware";
import { AdminDashboardController } from "../controllers/admin.dashboard.controller";
const adminDashboardController = new AdminDashboardController();

const adminDashboardRouter = Router();

/**
 * @swagger
 * /api/admin/dashboard/stats:
 *   get:
 *     tags:
 *       - Admin Dashboard
 *     summary: Get aggregated dashboard statistics
 *     description: Returns total sales, orders, customers, vendors, and products for the admin dashboard.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard statistics fetched successfully
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
 *                     totalSales:
 *                       type: number
 *                       format: float
 *                       description: Total sales from delivered and paid orders
 *                       example: 15000.75
 *                     totalOrders:
 *                       type: integer
 *                       description: Total number of orders
 *                       example: 348
 *                     totalCustomers:
 *                       type: integer
 *                       description: Total number of users with role CUSTOMER
 *                       example: 97
 *                     totalVendors:
 *                       type: integer
 *                       description: Total number of vendors registered
 *                       example: 14
 *                     totalProducts:
 *                       type: integer
 *                       description: Total number of products listed
 *                       example: 220
 *       401:
 *         description: Unauthorized - No token or invalid token
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
 *                   example: "Unauthorized: Missing or invalid token"
 *       403:
 *         description: Forbidden - Access restricted to admins
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
 *                   example: "Access denied: not an admin"
 *       500:
 *         description: Server error while fetching statistics
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
 *                   example: Error fetching dashboard stats
 *                 error:
 *                   type: string
 *                   example: "Failed to fetch dashboard statistics: <details>"
 */
adminDashboardRouter.get("/stats", authMiddleware, isAdminOrStaff, adminDashboardController.getDashboardStats.bind(adminDashboardController));


/**
 * @swagger
 * /api/admin/dashboard/revenue:
 *   get:
 *     summary: Get daily revenue chart data for admin dashboard
 *     description: Returns daily revenue (totalPrice + shippingFee) for the last N days (default 7). Filter by query param `days`.
 *     tags: [Admin Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 7
 *           minimum: 1
 *           example: 30
 *         required: false
 *         description: Number of days to fetch revenue data for (e.g., 7 or 30)
 *     responses:
 *       200:
 *         description: Returns an array of objects with daily revenue
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                     example: "12 Jun"
 *                   revenue:
 *                     type: number
 *                     example: 12345.67
 *       401:
 *         description: Unauthorized - Admin access required
 *       500:
 *         description: Internal server error when fetching revenue data
 */
adminDashboardRouter.get("/revenue", authMiddleware, isAdminOrStaff, adminDashboardController.getRevenueChart.bind(adminDashboardController));

export default adminDashboardRouter;