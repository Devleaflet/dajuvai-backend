import { Router } from 'express';
import { authMiddleware, isAdminOrStaff } from '../../middlewares/auth.middleware';
import { AdminVendorsController } from '../../controllers/admin.vendors.controller';

const adminVendorsController = new AdminVendorsController();
const adminVendorsRouter = Router();

/**
 * @swagger
 * /api/admin/vendors/stats:
 *   get:
 *     summary: Get vendor page statistics
 *     description: |
 *       Returns aggregated statistics for the admin vendors page:
 *       - Total number of vendors
 *       - Number of vendors pending approval
 *       - Top earning vendor for the current calendar month
 *     tags:
 *       - Admin Vendors
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Vendor page statistics fetched successfully
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
 *                     totalVendors:
 *                       type: integer
 *                       example: 42
 *                     pendingApprovals:
 *                       type: integer
 *                       example: 5
 *                     topEarningVendor:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         vendorId:
 *                           type: integer
 *                           example: 12
 *                         businessName:
 *                           type: string
 *                           example: "Tech Supplies Co."
 *                         totalRevenue:
 *                           type: number
 *                           format: float
 *                           example: 89450.75
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
 *                   example: "Error fetching vendor page stats"
 *                 error:
 *                   type: string
 *                   example: "Something went wrong"
 */
adminVendorsRouter.get(
    '/stats',
    authMiddleware,
    isAdminOrStaff,
    adminVendorsController.getVendorPageStats.bind(adminVendorsController)
);

/**
 * @swagger
 * /api/admin/vendors/top-earning:
 *   get:
 *     summary: Get top earning vendor for the current month
 *     description: |
 *       Returns the vendor with the highest revenue from DELIVERED or CONFIRMED, PAID orders
 *       within the current calendar month.
 *     tags:
 *       - Admin Vendors
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Top earning vendor fetched successfully
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
 *                   nullable: true
 *                   properties:
 *                     vendorId:
 *                       type: integer
 *                       example: 12
 *                     businessName:
 *                       type: string
 *                       example: "Tech Supplies Co."
 *                     totalRevenue:
 *                       type: number
 *                       format: float
 *                       example: 89450.75
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
 *                   example: "Error fetching top earning vendor"
 *                 error:
 *                   type: string
 *                   example: "Something went wrong"
 */
adminVendorsRouter.get(
    '/top-earning',
    authMiddleware,
    isAdminOrStaff,
    adminVendorsController.getTopEarningVendor.bind(adminVendorsController)
);

export default adminVendorsRouter;
