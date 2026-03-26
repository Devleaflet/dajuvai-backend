import { Router } from 'express';
import { vendorAuthMiddleware, isVendor } from '../../middlewares/auth.middleware';
import { VendorProductsController } from '../../controllers/vendor.products.controller';

const vendorProductsRouter = Router();
const vendorProductsController = new VendorProductsController();

/**
 * @swagger
 * /api/vendor/products/stats:
 *   get:
 *     summary: Get vendor product page statistics
 *     description: >
 *       Returns totalActiveProducts (AVAILABLE), outOfStockCount, and topSellingItem
 *       for the authenticated vendor. Does NOT duplicate low-stock list or
 *       top-selling list endpoints.
 *     tags:
 *       - Vendor Products
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Product page statistics retrieved successfully
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
 *                     totalActiveProducts:
 *                       type: integer
 *                       example: 24
 *                     outOfStockCount:
 *                       type: integer
 *                       example: 3
 *                     topSellingItem:
 *                       oneOf:
 *                         - type: object
 *                           properties:
 *                             productId:
 *                               type: integer
 *                               example: 12
 *                             productName:
 *                               type: string
 *                               example: Wireless Headphones
 *                             totalSold:
 *                               type: integer
 *                               example: 150
 *                             totalRevenue:
 *                               type: number
 *                               format: float
 *                               example: 22500.00
 *                         - type: 'null'
 *       401:
 *         description: Unauthorized - Invalid or missing vendor token
 *       500:
 *         description: Internal server error
 */
vendorProductsRouter.get(
    '/stats',
    vendorAuthMiddleware,
    isVendor,
    vendorProductsController.getProductPageStats.bind(vendorProductsController)
);

/**
 * @swagger
 * /api/vendor/products/recent-reviews:
 *   get:
 *     summary: Get recent reviews on vendor's products
 *     description: >
 *       Returns the latest N customer reviews across all products belonging to this vendor.
 *       Use ?limit=N to control count.
 *     tags:
 *       - Vendor Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         required: false
 *         description: Maximum number of reviews to return.
 *     responses:
 *       200:
 *         description: Recent reviews retrieved successfully
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
 *                         type: integer
 *                         example: 45
 *                       rating:
 *                         type: integer
 *                         example: 4
 *                       comment:
 *                         type: string
 *                         example: Great product, fast delivery!
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2026-03-25T10:20:30.000Z
 *                       product:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 12
 *                           name:
 *                             type: string
 *                             example: Wireless Headphones
 *                       user:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 7
 *                           fullName:
 *                             type: string
 *                             example: John Doe
 *       401:
 *         description: Unauthorized - Invalid or missing vendor token
 *       500:
 *         description: Internal server error
 */
vendorProductsRouter.get(
    '/recent-reviews',
    vendorAuthMiddleware,
    isVendor,
    vendorProductsController.getRecentReviews.bind(vendorProductsController)
);

export default vendorProductsRouter;
