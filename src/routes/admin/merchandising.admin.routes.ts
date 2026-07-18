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
 *     responses:
 *       200:
 *         description: Items
 *   post:
 *     summary: Add one or more items to a placement (appended last)
 *     description: Unknown or already-present items are silently skipped.
 *     tags:
 *       - Admin Placements
 *     security:
 *       - bearerAuth: []
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
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Remove an item from a placement (the catalog row is untouched)
 *     tags:
 *       - Admin Placements
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Removed
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
 */
merchandisingAdminRouter.get(
    "/:slug/available-items",
    authMiddleware,
    isAdminOrStaff,
    controller.availableItems.bind(controller),
);

export default merchandisingAdminRouter;
