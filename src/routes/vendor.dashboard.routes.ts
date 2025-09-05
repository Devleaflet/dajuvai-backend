import { Router } from "express";
import { VendorDashboardController } from "../controllers/vendor.dashboard.controller";
import { isVendor, vendorAuthMiddleware } from "../middlewares/auth.middleware";

const vendorDashboardController = new VendorDashboardController();
const vendorDashBoardRouter = Router();

/**
 * @swagger
 * /api/vendor/dashboard/stats:
 *   get:
 *     summary: Get vendor dashboard statistics
 *     description: Returns key statistics for the authenticated vendor including total products, total orders, total sales, and pending orders.
 *     tags:
 *       - Vendor Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved vendor stats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalProducts:
 *                   type: integer
 *                   example: 15
 *                 totalOrders:
 *                   type: integer
 *                   example: 100
 *                 totalSales:
 *                   type: number
 *                   format: float
 *                   example: 150000.50
 *                 totalPendingOrders:
 *                   type: integer
 *                   example: 8
 *       401:
 *         description: Unauthorized - Invalid or missing token
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
 *                   example: Unauthorized
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
 *                   example: Internal server error
 */
vendorDashBoardRouter.get("/stats", vendorAuthMiddleware, vendorDashboardController.getDashboard.bind(vendorDashboardController));


/**
 * @swagger
 * /api/vendor/dashboard/orders:
 *   get:
 *     summary: Get detailed order list for vendor
 *     description: |
 *       Returns a detailed list of all orders associated with the authenticated vendor.
 *       Each record includes product name, quantity, price, total, order status, date, and primary product image.
 *     tags:
 *       - Vendor Dashboard
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully fetched vendor order details
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   productName:
 *                     type: string
 *                     example: Premium Olive Oil
 *                   quantity:
 *                     type: integer
 *                     example: 2
 *                   price:
 *                     type: number
 *                     format: float
 *                     example: 450
 *                   total:
 *                     type: number
 *                     format: float
 *                     example: 900
 *                   orderStatus:
 *                     type: string
 *                     example: DELIVERED
 *                   orderedAt:
 *                     type: string
 *                     format: date-time
 *                     example: 2025-06-14T08:32:21.000Z
 *       401:
 *         description: Unauthorized - Vendor token missing or invalid
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
 *                   example: Unauthorized
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
 *                   example: Internal server error
 */
vendorDashBoardRouter.get("/orders", vendorAuthMiddleware, isVendor, vendorDashboardController.getVendorOrderDetails.bind(vendorDashboardController));

vendorDashBoardRouter.get("/total-sales", vendorAuthMiddleware, isVendor, vendorDashboardController.vendorSalesReport.bind(vendorDashboardController));

vendorDashBoardRouter.get("/low-stock", vendorAuthMiddleware, isVendor, vendorDashboardController.getLowStockProducts.bind(vendorDashboardController));

export default vendorDashBoardRouter;