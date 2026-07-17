import { Router } from "express";
import { authMiddleware, isAdmin, isAdminOrStaff } from "../../middlewares/auth.middleware";
import { MerchandisingController } from "../../controllers/merchandising.controller";

const merchandisingAdminRouter = Router();
const controller = new MerchandisingController();

/**
 * @swagger
 * /api/admin/placements/{code}/categories:
 *   get:
 *     summary: Every category, merged with its config for this placement
 *     description: |
 *       Returns all categories. Assigned ones come first in placement order and
 *       carry inPlacement=true; unassigned ones follow, alphabetically, so the
 *       admin can add them.
 *     tags:
 *       - Admin Merchandising
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Merged category list
 *       403:
 *         description: Staff or admin access required
 */
merchandisingAdminRouter.get(
    "/:code/categories",
    authMiddleware,
    isAdminOrStaff,
    controller.getAdminCategories.bind(controller),
);

/**
 * @swagger
 * /api/admin/placements/{code}/categories/reorder:
 *   patch:
 *     summary: Apply a whole ordering to a placement
 *     description: |
 *       One transaction. Every categoryId must already be in the placement; a
 *       payload naming an unknown id writes nothing.
 *     tags:
 *       - Admin Merchandising
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 categoryId:
 *                   type: integer
 *                 displayOrder:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Updated list
 *       400:
 *         description: An id in the payload is not in the placement
 */
// Declared before /:code/categories/:targetId so "reorder" is not swallowed as an id.
merchandisingAdminRouter.patch(
    "/:code/categories/reorder",
    authMiddleware,
    isAdminOrStaff,
    controller.reorderCategories.bind(controller),
);

/**
 * @swagger
 * /api/admin/placements/{code}/categories:
 *   post:
 *     summary: Add a category to a placement (appended last)
 *     tags:
 *       - Admin Merchandising
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               categoryId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Added
 *       409:
 *         description: Already in this placement
 */
merchandisingAdminRouter.post(
    "/:code/categories",
    authMiddleware,
    isAdmin,
    controller.addCategory.bind(controller),
);

/**
 * @swagger
 * /api/admin/placements/{code}/categories/{targetId}:
 *   patch:
 *     summary: Toggle visible, featured or pinned
 *     tags:
 *       - Admin Merchandising
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Remove a category from a placement
 *     description: Deletes the placement row only. The category itself is untouched.
 *     tags:
 *       - Admin Merchandising
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Removed
 */
merchandisingAdminRouter.patch(
    "/:code/categories/:targetId",
    authMiddleware,
    isAdminOrStaff,
    controller.updateCategory.bind(controller),
);
merchandisingAdminRouter.delete(
    "/:code/categories/:targetId",
    authMiddleware,
    isAdmin,
    controller.removeCategory.bind(controller),
);

/**
 * @swagger
 * /api/admin/placements/{code}/subcategories:
 *   get:
 *     summary: Every subcategory, merged with its config for this placement
 *     tags:
 *       - Admin Merchandising
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Merged subcategory list
 */
merchandisingAdminRouter.get(
    "/:code/subcategories",
    authMiddleware,
    isAdminOrStaff,
    controller.getAdminSubcategories.bind(controller),
);
merchandisingAdminRouter.patch(
    "/:code/subcategories/reorder",
    authMiddleware,
    isAdminOrStaff,
    controller.reorderSubcategories.bind(controller),
);
merchandisingAdminRouter.post(
    "/:code/subcategories",
    authMiddleware,
    isAdmin,
    controller.addSubcategory.bind(controller),
);
merchandisingAdminRouter.patch(
    "/:code/subcategories/:targetId",
    authMiddleware,
    isAdminOrStaff,
    controller.updateSubcategory.bind(controller),
);
merchandisingAdminRouter.delete(
    "/:code/subcategories/:targetId",
    authMiddleware,
    isAdmin,
    controller.removeSubcategory.bind(controller),
);

export default merchandisingAdminRouter;
