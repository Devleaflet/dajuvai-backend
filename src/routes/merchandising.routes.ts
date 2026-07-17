import { Router } from "express";
import { MerchandisingController } from "../controllers/merchandising.controller";

const merchandisingRoutes = Router();
const controller = new MerchandisingController();

/**
 * @swagger
 * /api/placements:
 *   get:
 *     summary: List active placements
 *     description: Surfaces where catalog items can be merchandised (mega menu, homepage, …).
 *     tags:
 *       - Merchandising
 *     responses:
 *       200:
 *         description: Active placements
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
 *                       code:
 *                         type: string
 *                         example: MEGA_MENU
 *                       label:
 *                         type: string
 *                         example: Mega Menu
 *                       sortOrder:
 *                         type: integer
 *                         example: 1
 */
merchandisingRoutes.get("/", controller.listPlacements.bind(controller));

/**
 * @swagger
 * /api/placements/{code}/categories:
 *   get:
 *     summary: Categories in a placement
 *     description: |
 *       Visible categories for the placement, sorted pinned first then by
 *       display order. Each row carries its subcategories.
 *     tags:
 *       - Merchandising
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *           example: HOMEPAGE
 *     responses:
 *       200:
 *         description: Visible categories in placement order
 *       404:
 *         description: Unknown or inactive placement
 */
merchandisingRoutes.get("/:code/categories", controller.getPublicCategories.bind(controller));

/**
 * @swagger
 * /api/placements/{code}/subcategories:
 *   get:
 *     summary: Subcategories in a placement
 *     tags:
 *       - Merchandising
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *           example: MEGA_MENU
 *     responses:
 *       200:
 *         description: Visible subcategories in placement order
 *       404:
 *         description: Unknown or inactive placement
 */
merchandisingRoutes.get("/:code/subcategories", controller.getPublicSubcategories.bind(controller));

export default merchandisingRoutes;
