import { Router } from "express";
import { authMiddleware, isAdmin, isAdminOrStaff } from "../../middlewares/auth.middleware";
import { MerchandisingController } from "../../controllers/merchandising.controller";

const merchandisingAdminRouter = Router();
const controller = new MerchandisingController();

/**
 * @swagger
 * /api/admin/placements/{slug}/items:
 *   get:
 *     summary: All items in a placement (nested for mega-menu, flat for others)
 *     tags:
 *       - Admin Placements
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: "featured-categories"
 *     responses:
 *       200:
 *         description: Items
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
 *                     description: Placement item entity
 *   post:
 *     summary: Add one or more items to a placement (appended last)
 *     description: Unknown or already-present items are silently skipped.
 *     tags:
 *       - Admin Placements
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: "featured-categories"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     entityType:
 *                       type: string
 *                       enum: [category, subcategory]
 *                     entityId:
 *                       type: integer
 *     responses:
 *       201:
 *         description: Added
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
 *                   example: "Items added to placement"
 */
merchandisingAdminRouter.get(
    "/:slug/items",
    authMiddleware,
    isAdminOrStaff,
    controller.getItems.bind(controller),
);
merchandisingAdminRouter.post(
    "/:slug/items",
    authMiddleware,
    isAdmin,
    controller.addItems.bind(controller),
);

/**
 * @swagger
 * /api/admin/placements/{slug}/items/{itemId}:
 *   patch:
 *     summary: Toggle visibility of a single item
 *     tags:
 *       - Admin Placements
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: "featured-categories"
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 42
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               visible:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       200:
 *         description: Updated
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
 *                   example: "Visibility toggled"
 *   delete:
 *     summary: Remove an item from a placement (the catalog row is untouched)
 *     tags:
 *       - Admin Placements
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: "featured-categories"
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 42
 *     responses:
 *       200:
 *         description: Removed
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
 *                   example: "Item removed from placement"
 */
merchandisingAdminRouter.patch(
    "/:slug/items/:itemId",
    authMiddleware,
    isAdminOrStaff,
    controller.updateVisibility.bind(controller),
);
merchandisingAdminRouter.delete(
    "/:slug/items/:itemId",
    authMiddleware,
    isAdmin,
    controller.removeItem.bind(controller),
);

/**
 * @swagger
 * /api/admin/placements/{slug}/reorder:
 *   put:
 *     summary: Apply a whole ordering to a placement in one transaction
 *     description: An itemId not already in the placement causes the whole request to write nothing.
 *     tags:
 *       - Admin Placements
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: "featured-categories"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     itemId:
 *                       type: integer
 *                     displayOrder:
 *                       type: integer
 *     responses:
 *       200:
 *         description: Order updated
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
 *                   example: "Reordering applied"
 *       400:
 *         description: An id in the payload is not in the placement
 */
merchandisingAdminRouter.put(
    "/:slug/reorder",
    authMiddleware,
    isAdminOrStaff,
    controller.reorder.bind(controller),
);

/**
 * @swagger
 * /api/admin/placements/{slug}/available-items:
 *   get:
 *     summary: Items not yet in this placement, for the Add Items picker
 *     tags:
 *       - Admin Placements
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *         example: "featured-categories"
 *       - in: query
 *         name: entityType
 *         schema:
 *           type: string
 *           enum: [category, subcategory]
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: integer
 *         description: Scopes mega-menu's subcategory picker to one category
 *     responses:
 *       200:
 *         description: Available items
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
 *                     description: Available catalog entity (category/subcategory)
 */
merchandisingAdminRouter.get(
    "/:slug/available-items",
    authMiddleware,
    isAdminOrStaff,
    controller.availableItems.bind(controller),
);

export default merchandisingAdminRouter;
