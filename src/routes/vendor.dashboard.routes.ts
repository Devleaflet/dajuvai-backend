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


/**
 * @swagger
 * /api/vendor/dashboard/total-sales:
 *   get:
 *     summary: Get vendor's total sales
 *     description: |
 *       Fetch the total sales amount for the authenticated vendor.  
 *       - Supports optional date range filters (`startDate`, `endDate`).  
 *       - Only includes orders with status `DELIVERED` or `CONFIRMED`.  
 *     tags:
 *       - Vendor Dashboard
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
 *     responses:
 *       200:
 *         description: Total sales retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vendorId:
 *                   type: integer
 *                   example: 7
 *                 totalSales:
 *                   type: number
 *                   format: float
 *                   example: 12500.75
 *       401:
 *         description: Unauthorized (vendor not authenticated)
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
 *                   example: "Unauthorized"
 *       403:
 *         description: Forbidden (user is not a vendor)
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
vendorDashBoardRouter.get("/total-sales", vendorAuthMiddleware, isVendor, vendorDashboardController.vendorSalesReport.bind(vendorDashboardController));


/**
 * @swagger
 * /api/vendor/dashboard/low-stock:
 *   get:
 *     summary: Get vendor's low stock products
 *     description: |
 *       Fetch a paginated list of products belonging to the authenticated vendor that are in **LOW_STOCK** or **OUT_OF_STOCK** status.  
 *       - Supports pagination via `page`.  
 *       - Considers both product-level and variant-level stock.  
 *     tags:
 *       - Vendor Dashboard
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         required: false
 *         description: Page number for pagination.
 *     responses:
 *       200:
 *         description: Low stock products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 currentPage:
 *                   type: integer
 *                   example: 1
 *                 totalPage:
 *                   type: integer
 *                   example: 3
 *                 totalData:
 *                   type: integer
 *                   example: 12
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       productId:
 *                         type: integer
 *                         example: 42
 *                       productName:
 *                         type: string
 *                         example: "Wireless Mouse"
 *                       vendorId:
 *                         type: integer
 *                         example: 7
 *                       vendorName:
 *                         type: string
 *                         example: "Tech Supplies Co."
 *                       stock:
 *                         type: integer
 *                         example: 3
 *                       status:
 *                         type: string
 *                         example: "LOW_STOCK"
 *                       variantStatus:
 *                         type: string
 *                         example: "LOW_STOCK"
 *       401:
 *         description: Unauthorized (vendor not authenticated)
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
 *                   example: "Unauthorized"
 *       403:
 *         description: Forbidden (user is not a vendor)
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
vendorDashBoardRouter.get("/low-stock", vendorAuthMiddleware, isVendor, vendorDashboardController.getLowStockProducts.bind(vendorDashboardController));

vendorDashBoardRouter.get("/analytics/top-selling-products", vendorDashboardController.getTopSellingProduct.bind(vendorDashboardController));
// vendorAuthMiddleware, isVendor,
export default vendorDashBoardRouter;