import { Router } from 'express';
import { authMiddleware, isAdminOrStaff } from '../../middlewares/auth.middleware';
import { AdminUsersController } from '../../controllers/admin.users.controller';

const adminUsersController = new AdminUsersController();
const adminUsersRouter = Router();

/**
 * @swagger
 * /api/admin/users/stats:
 *   get:
 *     summary: Get user page statistics
 *     description: |
 *       Returns aggregated statistics for the admin users page:
 *       - Total number of users (role = USER)
 *       - New users registered in the past 7 days
 *       - Average Order Value (AOV) from paid orders
 *     tags:
 *       - Admin Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User page statistics fetched successfully
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
 *                     totalUsers:
 *                       type: integer
 *                       description: Total number of users with role USER
 *                       example: 320
 *                     newUsersThisWeek:
 *                       type: integer
 *                       description: Number of new users registered in the past 7 days
 *                       example: 18
 *                     averageOrderValue:
 *                       type: object
 *                       properties:
 *                         aov:
 *                           type: number
 *                           format: float
 *                           description: Average value of paid orders
 *                           example: 1250.75
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
 *                   example: "Error fetching user page stats"
 *                 error:
 *                   type: string
 *                   example: "Something went wrong"
 */
adminUsersRouter.get(
    '/stats',
    authMiddleware,
    isAdminOrStaff,
    adminUsersController.getUserPageStats.bind(adminUsersController)
);

/**
 * @swagger
 * /api/admin/users/heat:
 *   get:
 *     summary: Get customer heat data
 *     description: |
 *       Returns a ranked list of customers by order frequency and total spend.
 *       Each customer is assigned a heat level:
 *       - **HIGH**: 5 or more orders
 *       - **MEDIUM**: 2 to 4 orders
 *       - **LOW**: fewer than 2 orders
 *     tags:
 *       - Admin Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *         required: false
 *         description: Maximum number of customers to return (default 20)
 *     responses:
 *       200:
 *         description: Customer heat data fetched successfully
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
 *                       userId:
 *                         type: integer
 *                         example: 7
 *                       fullName:
 *                         type: string
 *                         example: "Ram Bahadur"
 *                       email:
 *                         type: string
 *                         example: "ram@example.com"
 *                       orderCount:
 *                         type: integer
 *                         example: 8
 *                       totalSpent:
 *                         type: number
 *                         format: float
 *                         example: 24500.00
 *                       heatLevel:
 *                         type: string
 *                         enum: [HIGH, MEDIUM, LOW]
 *                         example: "HIGH"
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
 *                   example: "Error fetching customer heat data"
 *                 error:
 *                   type: string
 *                   example: "Something went wrong"
 */
adminUsersRouter.get(
    '/heat',
    authMiddleware,
    isAdminOrStaff,
    adminUsersController.getCustomerHeat.bind(adminUsersController)
);

export default adminUsersRouter;
