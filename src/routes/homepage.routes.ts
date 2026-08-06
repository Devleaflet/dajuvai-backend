import { Router } from "express";
import { HomePageSectionController } from "../controllers/homepage.controller";
import {
    createHomePageSectionSchema,
    updateHomePageSectionSchema,
} from "../utils/zod_validations/homepage.zod";
import { authMiddleware, isAdmin, isAdminOrStaff, validateZod } from "../middlewares/auth.middleware";
import { checkPermission } from "../middlewares/permission.middleware";
import { ModuleName, PermissionLevel } from "../entities/permission.enum";
import { responseCache } from "../middlewares/responseCache.middleware";

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
 *               - productSource
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
 *               productSource:
 *                 type: string
 *                 enum: [manual, category, subcategory, deal]
 *                 description: Source type for products
 *                 example: manual
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: Array of product IDs (for manual source)
 *                 example: [1, 2, 3, 4]
 *               selectedCategoryId:
 *                 type: number
 *                 description: Category ID (for category source)
 *                 example: 1
 *               selectedSubcategoryId:
 *                 type: number
 *                 description: Subcategory ID (for subcategory source)
 *                 example: 1
 *               selectedDealId:
 *                 type: number
 *                 description: Deal ID (for deal source)
 *                 example: 1
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
 *                 homepage:
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
 *                   example: "Authentication required"
 *       403:
 *         description: Forbidden - Admin access required
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
 *                   example: "Admin access required"
 *       404:
 *         description: Some product IDs are invalid
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
 *                   example: "Some product IDs are invalid"
 *       409:
 *         description: Section with this title already exists
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
 *                   example: "Section with this title already exists"
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
router.post(
    "/",
    authMiddleware,
    isAdminOrStaff,
    checkPermission(ModuleName.ARRANGEMENT, PermissionLevel.CREATE_EDIT),
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
 *               productSource:
 *                 type: string
 *                 enum: [manual, category, subcategory, deal]
 *                 description: Source type for products
 *                 example: manual
 *               productIds:
 *                 type: array
 *                 items:
 *                   type: number
 *                 description: Array of product IDs (for manual source)
 *                 example: [1, 2, 5, 6]
 *               selectedCategoryId:
 *                 type: number
 *                 description: Category ID (for category source)
 *                 example: 1
 *               selectedSubcategoryId:
 *                 type: number
 *                 description: Subcategory ID (for subcategory source)
 *                 example: 1
 *               selectedDealId:
 *                 type: number
 *                 description: Deal ID (for deal source)
 *                 example: 1
 *             description: At least one field must be provided for update
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
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           price:
 *                             type: number
 *       400:
 *         description: Bad request (validation errors or no fields provided)
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
 *                   example: "Validation errors"
 *       401:
 *         description: Unauthorized - Authentication required
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
 *                   example: "Authentication required"
 *       403:
 *         description: Forbidden - Admin access required
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
 *                   example: "Admin access required"
 *       404:
 *         description: Homepage section not found or invalid product IDs
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
 *                   example: "Homepage section not found or invalid product IDs"
 *       409:
 *         description: Section with this title already exists
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
 *                   example: "Section with this title already exists"
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
router.put(
    "/:id",
    authMiddleware,
    isAdminOrStaff,
    checkPermission(ModuleName.ARRANGEMENT, PermissionLevel.CREATE_EDIT),
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
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *         description: Filter sections by title (case-insensitive, partial match)
 *         example: "deals"
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
 *                             avgRating:
 *                               type: number
 *                               example: 4.5
 *                             reviewCount:
 *                               type: integer
 *                               example: 12
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
router.get(
    "/",
    responseCache({ ttlSeconds: 30 }),
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
 *                   type: array
 *                   description: Products in the requested homepage section, enriched with review data.
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 42
 *                       name:
 *                         type: string
 *                         example: "Premium Cooking Oil"
 *                       price:
 *                         type: number
 *                         example: 450
 *                       image:
 *                         type: string
 *                         nullable: true
 *                       description:
 *                         type: string
 *                       avgRating:
 *                         type: number
 *                         example: 4.5
 *                       count:
 *                         type: integer
 *                         description: Number of reviews for this product.
 *                         example: 12
 *       400:
 *         description: Bad request (invalid ID format)
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
 *                   example: "Invalid ID format"
 *       404:
 *         description: Homepage section not found
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
 *                   example: "Homepage section not found"
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
router.get(
    "/:id",
    responseCache({ ttlSeconds: 30 }),
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
 *                   example: "Invalid ID format"
 *       401:
 *         description: Unauthorized - Authentication required
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
 *                   example: "Authentication required"
 *       403:
 *         description: Forbidden - Admin access required
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
 *                   example: "Admin access required"
 *       404:
 *         description: Homepage section not found
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
 *                   example: "Homepage section not found"
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
router.delete(
    "/:id",
    authMiddleware,
    isAdminOrStaff,
    checkPermission(ModuleName.ARRANGEMENT, PermissionLevel.DELETE),
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
 *                         properties:
 *                           id:
 *                             type: integer
 *                           name:
 *                             type: string
 *                           price:
 *                             type: number
 *       400:
 *         description: Bad request (invalid ID format)
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
 *                   example: "Invalid ID format"
 *       401:
 *         description: Unauthorized - Authentication required
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
 *                   example: "Authentication required"
 *       403:
 *         description: Forbidden - Admin access required
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
 *                   example: "Admin access required"
 *       404:
 *         description: Homepage section not found
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
 *                   example: "Homepage section not found"
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
router.patch(
    "/:id/toggle-status",
    authMiddleware,
    isAdminOrStaff,
    checkPermission(ModuleName.ARRANGEMENT, PermissionLevel.CREATE_EDIT),
    homePageSectionController.toggleSectionStatus.bind(homePageSectionController)
);

export default router;
