import { Router } from 'express';
import { ContactController } from '../controllers/contact.controller';
import { authMiddleware, isAdmin, isAdminOrStaff, validateZod } from '../middlewares/auth.middleware';
import { adminContactQuerySchema, contactSchema } from '../utils/zod_validations/contact.zod';

const router = Router();
const contactController = new ContactController();

/**
 * @swagger
 * /api/contact:
 *   post:
 *     summary: Submit contact form
 *     description: Allows users to submit a contact form with personal and message details.
 *     tags: [Contact]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - phone
 *               - subject
 *               - message
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: John
 *               lastName:
 *                 type: string
 *                 example: Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               phone:
 *                 type: string
 *                 example: 9876543210
 *               subject:
 *                 type: string
 *                 example: Inquiry about services
 *               message:
 *                 type: string
 *                 example: I would like to know more about your offerings.
 *     responses:
 *       201:
 *         description: Contact form submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Contact form submitted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     firstName:
 *                       type: string
 *                       example: John
 *                     lastName:
 *                       type: string
 *                       example: Doe
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: john.doe@example.com
 *                     phone:
 *                       type: string
 *                       example: 9876543210
 *                     subject:
 *                       type: string
 *                       example: Inquiry about services
 *                     message:
 *                       type: string
 *                       example: I would like to know more about your offerings.
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2025-05-30T12:34:56Z
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                       example: 2025-05-30T12:34:56Z
 *       400:
 *         description: Bad request due to invalid input
 *       500:
 *         description: Internal server error
 */

router.post('/', validateZod(contactSchema), contactController.createContact.bind(contactController));

/**
 * @swagger
 * /api/contact/admin:
 *   get:
 *     summary: Get paginated list of contacts for admin and staff
 *     description: Retrieves a paginated list of contact submissions, ordered by creation date descending.
 *     tags: [Contact]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number (must be >= 1)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 7
 *         description: Number of contacts per page (must be >= 1)
 *     responses:
 *       200:
 *         description: Paginated contacts retrieved successfully
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
 *                     contacts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           firstName:
 *                             type: string
 *                             example: John
 *                           lastName:
 *                             type: string
 *                             example: Doe
 *                           email:
 *                             type: string
 *                             format: email
 *                             example: john.doe@example.com
 *                           phone:
 *                             type: string
 *                             example: 9876543210
 *                           subject:
 *                             type: string
 *                             example: Inquiry about services
 *                           message:
 *                             type: string
 *                             example: I would like to know more about your offerings.
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                             example: 2025-05-30T12:34:56Z
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             example: 2025-05-30T12:34:56Z
 *                     total:
 *                       type: integer
 *                       example: 42
 *       400:
 *         description: Invalid query parameters
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not admin)
 *       500:
 *         description: Internal server error
 */
router.get('/admin', authMiddleware, isAdminOrStaff, validateZod(adminContactQuerySchema, "query"), contactController.getAdminContacts.bind(contactController));

export default router;