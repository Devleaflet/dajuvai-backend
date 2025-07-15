import { Router } from "express";
import { HomePageSectionController } from "../controllers/homepage.controller";
import {
    createHomePageSectionSchema,
    updateHomePageSectionSchema,
} from "../utils/zod_validations/homepage.zod";
import { authMiddleware, isAdmin, isAdminOrStaff, validateZod } from "../middlewares/auth.middleware";

const router = Router();
const homePageSectionController = new HomePageSectionController();

/**
 * @swagger
 * /api/homepage:
 *   post:
 *     summary: Create a new homepage section
 *     tags: [Homepage Sections]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - productIds
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Section title (must be unique)
 *                 example: "Best of Oils"
 *               isActive:
 *                 type: boolean
 *                 default: true
 *                 description: Whether the section is active
 *                 example: true
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                   minimum: 1
 *                 minItems: 1
 *                 maxItems: 50
 *                 description: Array of product IDs to include in this section
 *                 example: [1, 2, 3, 4]
 *     responses:
 *       201:
 *         description: Homepage section created successfully
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
 *                   example: "Home page section created successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     title:
 *                       type: string
 *                       example: "Best of Oils"
 *                     isActive:
 *                       type: boolean
 *                       example: true
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           price:
 *                             type: number
 *       400:
 *         description: Bad request (validation errors)
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
 *                   example: "Title is required"
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Some product IDs are invalid
 *       409:
 *         description: Section with this title already exists
 *       500:
 *         description: Internal server error
 */
router.post(
    "/",
    authMiddleware,
    isAdminOrStaff,
    validateZod(createHomePageSectionSchema),
    homePageSectionController.createHomePageSection.bind(homePageSectionController)
);

/**
 * @swagger
 * /api/homepage/{id}:
 *   put:
 *     summary: Update an existing homepage section
 *     tags: [Homepage Sections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Homepage section ID
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Section title (must be unique)
 *                 example: "Updated Section Title"
 *               isActive:
 *                 type: boolean
 *                 description: Whether the section is active
 *                 example: false
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *                   minimum: 1
 *                 minItems: 1
 *                 maxItems: 50
 *                 description: Array of product IDs to include in this section
 *                 example: [1, 2, 5, 6]
 *             note: At least one field must be provided for update
 *     responses:
 *       200:
 *         description: Homepage section updated successfully
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
 *                   example: "Home page section updated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     title:
 *                       type: string
 *                       example: "Updated Section Title"
 *                     isActive:
 *                       type: boolean
 *                       example: false
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Bad request (validation errors or no fields provided)
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Homepage section not found or invalid product IDs
 *       409:
 *         description: Section with this title already exists
 *       500:
 *         description: Internal server error
 */
router.put(
    "/:id",
    authMiddleware,
    isAdminOrStaff,
    validateZod(updateHomePageSectionSchema),
    homePageSectionController.updateHomePageSection.bind(homePageSectionController)
);

/**
 * @swagger
 * /api/homepage:
 *   get:
 *     summary: Get all homepage sections
 *     tags: [Homepage Sections]
 *     parameters:
 *       - in: query
 *         name: includeInactive
 *         required: false
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Include inactive sections in the response
 *         example: "true"
 *     responses:
 *       200:
 *         description: Homepage sections retrieved successfully
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
 *                   example: "Home page sections retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       title:
 *                         type: string
 *                         example: "Best of Oils"
 *                       isActive:
 *                         type: boolean
 *                         example: true
 *                       products:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                             name:
 *                               type: string
 *                             price:
 *                               type: number
 *                 count:
 *                   type: integer
 *                   description: Total number of sections returned
 *                   example: 3
 *       400:
 *         description: Bad request (invalid query parameters)
 *       500:
 *         description: Internal server error
 */
router.get(
    "/",
    homePageSectionController.getAllHomePageSections.bind(homePageSectionController)
);

/**
 * @swagger
 * /api/homepage/{id}:
 *   get:
 *     summary: Get a homepage section by ID
 *     tags: [Homepage Sections]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Homepage section ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Homepage section retrieved successfully
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
 *                   example: "Home page section retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     title:
 *                       type: string
 *                       example: "Best of Oils"
 *                     isActive:
 *                       type: boolean
 *                       example: true
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           price:
 *                             type: number
 *                           image:
 *                             type: string
 *                           description:
 *                             type: string
 *       400:
 *         description: Bad request (invalid ID format)
 *       404:
 *         description: Homepage section not found
 *       500:
 *         description: Internal server error
 */
router.get(
    "/:id",
    homePageSectionController.getHomePageSectionById.bind(homePageSectionController)
);

/**
 * @swagger
 * /api/homepage/{id}:
 *   delete:
 *     summary: Delete a homepage section
 *     tags: [Homepage Sections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Homepage section ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Homepage section deleted successfully
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
 *                   example: "Home page section deleted successfully"
 *       400:
 *         description: Bad request (invalid ID format)
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Homepage section not found
 *       500:
 *         description: Internal server error
 */
router.delete(
    "/:id",
    authMiddleware,
    isAdminOrStaff,
    homePageSectionController.deleteHomePageSection.bind(homePageSectionController)
);

/**
 * @swagger
 * /api/homepage/{id}/toggle-status:
 *   patch:
 *     summary: Toggle homepage section active/inactive status
 *     tags: [Homepage Sections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Homepage section ID
 *         example: 1
 *     responses:
 *       200:
 *         description: Section status toggled successfully
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
 *                   example: "Section status toggled successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     title:
 *                       type: string
 *                       example: "Best of Oils"
 *                     isActive:
 *                       type: boolean
 *                       example: false
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Bad request (invalid ID format)
 *       401:
 *         description: Unauthorized - Authentication required
 *       403:
 *         description: Forbidden - Admin access required
 *       404:
 *         description: Homepage section not found
 *       500:
 *         description: Internal server error
 */
router.patch(
    "/:id/toggle-status",
    authMiddleware,
    isAdminOrStaff,
    homePageSectionController.toggleSectionStatus.bind(homePageSectionController)
);

export default router;