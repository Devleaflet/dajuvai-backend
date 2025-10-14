

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
 *     description: |
 *       Returns daily revenue (**totalPrice + shippingFee**) for the last N days.  
 *       If no orders exist on a particular day, that day will still be included in the response with `0` revenue.
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
 *         description: Number of days to fetch revenue data for (e.g., 7 or 30).
 *     responses:
 *       200:
 *         description: Returns an array of objects with daily revenue data
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   date:
 *                     type: string
 *                     description: Date label (formatted as `DD Mon`)
 *                     example: "12 Sep"
 *                   revenue:
 *                     type: number
 *                     description: Total revenue for that day (totalPrice + shippingFee, or 0 if no orders)
 *                     example: 12345.67
 *       401:
 *         description: Unauthorized - Admin access required
 *       500:
 *         description: Internal server error when fetching revenue data
 */
adminDashboardRouter.get("/revenue", authMiddleware, isAdminOrStaff, adminDashboardController.getRevenueChart.bind(adminDashboardController));


/**
 * @swagger
 * /api/admin/dashboard/vendors-sales-amount:
 *   get:
 *     summary: Get vendors sales amount
 *     description: |
 *       Fetch total sales amount grouped by vendors.  
 *       - Supports optional date range filters (`startDate`, `endDate`).  
 *       - Supports pagination via `page`.  
 *       - Only includes orders with status `DELIVERED` or `CONFIRMED`.  
 *     tags:
 *       - Admin Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         required: false
 *         description: Start date filter (inclusive).
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         required: false
 *         description: End date filter (inclusive).
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: Page number for pagination.
 *     responses:
 *       200:
 *         description: Vendors sales amount retrieved successfully
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
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     currentPage:
 *                       type: integer
 *                       example: 1
 *                     totalPage:
 *                       type: integer
 *                       example: 3
 *                     totalData:
 *                       type: integer
 *                       example: 25
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           vendorId:
 *                             type: integer
 *                             example: 12
 *                           businessName:
 *                             type: string
 *                             example: "ABC Traders"
 *                           totalSales:
 *                             type: number
 *                             format: float
 *                             example: 15340.75
 *       400:
 *         description: Bad request (invalid query parameters)
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
 *                   example: "Valid section ID is required"
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       403:
 *         description: Forbidden (only admin or staff can access this route)
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
 *                   example: "Error fetching vendors sales amount"
 *                 error:
 *                   type: string
 *                   example: "Something went wrong"
 */
adminDashboardRouter.get("/vendors-sales-amount", authMiddleware, isAdminOrStaff, adminDashboardController.getVendorsSalesAmount.bind(adminDashboardController));


/**
 * @swagger
 * /api/admin/dashboard/top-products:
 *   get:
 *     summary: Get top selling products
 *     description: |
 *       Fetch products ranked by total sales amount (quantity × price).  
 *       - Supports optional date range filters (`startDate`, `endDate`).  
 *       - Supports pagination via `page`.  
 *       - Only includes orders with status `DELIVERED` or `CONFIRMED`.  
 *     tags:
 *       - Admin Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         required: false
 *         description: Start date filter (inclusive).
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         required: false
 *         description: End date filter (inclusive).
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: Page number for pagination.
 *     responses:
 *       200:
 *         description: Top products retrieved successfully
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
 *                     success:
 *                       type: boolean
 *                       example: true
 *                     currentPage:
 *                       type: integer
 *                       example: 1
 *                     totalPage:
 *                       type: integer
 *                       example: 5
 *                     totalData:
 *                       type: integer
 *                       example: 50
 *                     data:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           productId:
 *                             type: integer
 *                             example: 101
 *                           productName:
 *                             type: string
 *                             example: "Wireless Bluetooth Headphones"
 *                           totalSales:
 *                             type: number
 *                             format: float
 *                             example: 23450.75
 *       400:
 *         description: Bad request (invalid query parameters)
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
 *                   example: "Invalid query parameters"
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       403:
 *         description: Forbidden (only admin or staff can access this route)
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
 *                   example: "Error fetching top products"
 *                 error:
 *                   type: string
 *                   example: "Something went wrong"
 */
adminDashboardRouter.get("/top-products", authMiddleware, isAdminOrStaff, adminDashboardController.getTopProducts.bind(adminDashboardController));

/**
 * @swagger
 * /api/admin/dashboard/todays-sales:
 *   get:
 *     summary: Get today's total sales
 *     description: |
 *       Fetch the total sales amount for the current day.  
 *       - Only includes orders with status `DELIVERED` or `CONFIRMED`.  
 *       - The sales amount is the sum of `totalPrice` from orders placed today.  
 *     tags:
 *       - Admin Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Today's sales retrieved successfully
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
 *                       example: 4520.50
 *       401:
 *         description: Unauthorized (missing or invalid token)
 *       403:
 *         description: Forbidden (only admin or staff can access this route)
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
 *                   example: "Error fetching today's sales"
 *                 error:
 *                   type: string
 *                   example: "Something went wrong"
 */
adminDashboardRouter.get("/todays-sales", authMiddleware, isAdminOrStaff, adminDashboardController.getTodaysSales.bind(adminDashboardController));

export default adminDashboardRouter;