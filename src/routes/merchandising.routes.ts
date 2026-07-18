import { Router } from "express";
import { MerchandisingController } from "../controllers/merchandising.controller";

const merchandisingRoutes = Router();
const controller = new MerchandisingController();

/**
 * @swagger
 * /api/placements:
 *   get:
 *     summary: List placements
 *     tags:
 *       - Placements
 *     responses:
 *       200:
 *         description: All placements
 */
merchandisingRoutes.get("/", controller.listPlacements.bind(controller));

/**
 * @swagger
 * /api/placements/{slug}:
 *   get:
 *     summary: Single placement info
 *     tags:
 *       - Placements
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *           example: mega-menu
 *     responses:
 *       200:
 *         description: Placement info
 *       404:
 *         description: Placement not found
 */
merchandisingRoutes.get("/:slug", controller.getPlacement.bind(controller));

export default merchandisingRoutes;
