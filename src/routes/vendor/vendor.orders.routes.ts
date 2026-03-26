import { Router } from 'express';
import { vendorAuthMiddleware, isVendor } from '../../middlewares/auth.middleware';
import { VendorOrdersController } from '../../controllers/vendor.orders.controller';

const vendorOrdersRouter = Router();
const vendorOrdersController = new VendorOrdersController();

/**
 * @swagger
 * /api/vendor/orders/stats:
 *   get:
 *     summary: Get vendor order page statistics
 *     description: |
 *       Returns three stat cards for the vendor orders page:
 *       - needingFulfillment: order items in PENDING status awaiting action
 *       - inDelivery: order items currently SHIPPED or OUT_FOR_DELIVERY
 *       - completedToday: order items with DELIVERED status updated today
 *
 *       Note: Order listing is already available at /api/vendor/dashboard/orders
 *     tags:
 *       - Vendor Orders
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Order page statistics retrieved successfully
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
 *                     needingFulfillment:
 *                       type: integer
 *                       example: 8
 *                     inDelivery:
 *                       type: integer
 *                       example: 5
 *                     completedToday:
 *                       type: integer
 *                       example: 3
 *       401:
 *         description: Unauthorized - Invalid or missing vendor token
 *       500:
 *         description: Internal server error
 */
vendorOrdersRouter.get(
    '/stats',
    vendorAuthMiddleware,
    isVendor,
    vendorOrdersController.getOrderPageStats.bind(vendorOrdersController)
);

export default vendorOrdersRouter;
