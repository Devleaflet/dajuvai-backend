import { Router } from 'express';
import { DealController } from '../controllers/deal.controller';
import { authMiddleware, isAdmin, isAdminOrStaff, validateZod } from '../middlewares/auth.middleware';
import { createDealSchema, updateDealSchema } from '../utils/zod_validations/deal.zod';

const router = Router();
const dealController = new DealController();

/**
 * @swagger
 * /api/deal:
 *   post:
 *     summary: Create a new deal
 *     description: Create a new promotional deal. Admin access is required.
 *     tags: [Deals]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Deal data to be created
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - discountPercentage
 *               - status
 *             properties:
 *               name:
 *                 type: string
 *                 description: Unique name of the deal
 *                 example: "Summer Bonanza"
 *                 maxLength: 100
 *               discountPercentage:
 *                 type: number
 *                 description: Discount percentage to be applied (1-100)
 *                 minimum: 1
 *                 maximum: 100
 *                 example: 30
 *               status:
 *                 type: string
 *                 description: Status of the deal
 *                 enum: [ENABLED, DISABLED]
 *                 example: ENABLED
 *     responses:
 *       201:
 *         description: Deal created successfully
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
 *                       type: integer
 *                       description: Unique identifier of the deal
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Summer Bonanza"
 *                     discountPercentage:
 *                       type: number
 *                       example: 30
 *                     status:
 *                       type: string
 *                       example: "ENABLED"
 *                     createdById:
 *                       type: integer
 *                       description: ID of the admin who created the deal
 *                       example: 101
 *       400:
 *         description: Validation error or duplicate deal name
 *       401:
 *         description: Unauthorized – Admin authentication required
 *       500:
 *         description: Internal server error
 */
router.post('/', authMiddleware, isAdminOrStaff, validateZod(createDealSchema), dealController.createDeal.bind(dealController));

/**
 * @swagger
 * /api/deal/{id}:
 *   patch:
 *     summary: Update an existing deal
 *     description: Update deal details by ID. Admin access required.
 *     tags: [Deals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the deal to update
 *     requestBody:
 *       description: Deal fields to update (any or all)
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: New deal name (must be unique)
 *                 example: "Monsoon Sale"
 *               discountPercentage:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 100
 *                 description: New discount percentage
 *                 example: 30
 *               status:
 *                 type: string
 *                 enum: [ENABLED, DISABLED]
 *                 description: New deal status
 *                 example: "DISABLED"
 *     responses:
 *       200:
 *         description: Deal updated successfully
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
 *                       type: integer
 *                       example: 2
 *                     name:
 *                       type: string
 *                       example: "Monsoon Sale"
 *                     discountPercentage:
 *                       type: number
 *                       example: 30
 *                     status:
 *                       type: string
 *                       enum: [ENABLED, DISABLED]
 *                       example: "DISABLED"
 *                     createdById:
 *                       type: integer
 *                       example: 3
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-06-11T12:00:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-06-12T09:00:00.000Z"
 *       400:
 *         description: Validation error (e.g., invalid input types or constraints)
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
 *                   example: "Discount percentage cannot exceed 100%"
 *       401:
 *         description: Unauthorized (admin only)
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
 *       404:
 *         description: Deal not found
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
 *                   example: "Deal not found"
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
router.patch('/:id', authMiddleware, isAdminOrStaff, validateZod(updateDealSchema), dealController.updateDeal.bind(dealController));

/**
 * @swagger
 * /api/deal/{id}:
 *   get:
 *     summary: Get deal by ID
 *     description: Retrieve details of a deal by its unique ID.
 *     tags: [Deals]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The unique identifier of the deal
 *     responses:
 *       200:
 *         description: Deal found successfully
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
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Summer Sale"
 *                     discountPercentage:
 *                       type: number
 *                       example: 25
 *                     status:
 *                       type: string
 *                       enum: [ENABLED, DISABLED]
 *                       example: "ENABLED"
 *                     createdById:
 *                       type: integer
 *                       example: 2
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-06-11T08:00:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-06-12T09:30:00.000Z"
 *                     createdBy:
 *                       type: object
 *                       description: Admin who created the deal
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 2
 *                         name:
 *                           type: string
 *                           example: "Admin User"
 *                         email:
 *                           type: string
 *                           example: "admin@example.com"
 *       404:
 *         description: Deal not found
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
 *                   example: "Deal not found"
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
router.get('/:id', dealController.getDealById.bind(dealController));

/**
 * @swagger
 * /api/deal:
 *   get:
 *     summary: Get all deals
 *     description: Retrieve all deals, optionally filtered by status. Also returns product counts per deal and total number of deals.
 *     tags: [Deals]
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [ENABLED, DISABLED]
 *         description: Optional filter to get deals with a specific status
 *     responses:
 *       200:
 *         description: List of deals retrieved successfully
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
 *                     total:
 *                       type: integer
 *                       example: 3
 *                     productCounts:
 *                       type: object
 *                       additionalProperties:
 *                         type: integer
 *                       example:
 *                         "1": 5
 *                         "2": 2
 *                     deals:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           name:
 *                             type: string
 *                             example: "Winter Sale"
 *                           discountPercentage:
 *                             type: number
 *                             example: 30
 *                           status:
 *                             type: string
 *                             enum: [ENABLED, DISABLED]
 *                             example: "ENABLED"
 *                           createdById:
 *                             type: integer
 *                             example: 4
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-06-01T10:00:00.000Z"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: "2025-06-05T10:00:00.000Z"
 *                           createdBy:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 4
 *                               name:
 *                                 type: string
 *                                 example: "Admin Jane"
 *                               email:
 *                                 type: string
 *                                 example: "jane.admin@example.com"
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
router.get('/', dealController.getAllDeals.bind(dealController));

/**
 * @swagger
 * /api/deal/{id}:
 *   delete:
 *     summary: Delete a deal
 *     description: Admin-only endpoint to delete a deal by ID. Also unassigns associated products.
 *     tags: [Deals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the deal to delete
 *     responses:
 *       200:
 *         description: Deal deleted successfully
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
 *                   example: Deal deleted successfully
 *                 deletedDeal:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 5
 *                     name:
 *                       type: string
 *                       example: "Flash Sale"
 *                     discountPercentage:
 *                       type: number
 *                       example: 25
 *                     status:
 *                       type: string
 *                       enum: [ENABLED, DISABLED]
 *                       example: "DISABLED"
 *                     createdById:
 *                       type: integer
 *                       example: 2
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-06-01T10:00:00.000Z"
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2025-06-10T08:45:00.000Z"
 *       401:
 *         description: Unauthorized - admin access required
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
 *       404:
 *         description: Deal not found
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
 *                   example: Deal not found
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
router.delete('/:id', authMiddleware, isAdminOrStaff, dealController.deleteDeal.bind(dealController));

export default router;