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
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       slug:
 *                         type: string
 *                         example: "mega-menu"
 *                       title:
 *                         type: string
 *                         example: "Mega Menu"
 *                       type:
 *                         type: string
 *                         example: "category-menu"
 *                       isActive:
 *                         type: boolean
 *                         example: true
 *                       itemsCount:
 *                         type: integer
 *                         example: 8
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
 *                     slug:
 *                       type: string
 *                       example: "mega-menu"
 *                     title:
 *                       type: string
 *                       example: "Mega Menu"
 *                     type:
 *                       type: string
 *                       example: "category-menu"
 *                     isActive:
 *                       type: boolean
 *                       example: true
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           name:
 *                             type: string
 *                             example: "Electronics"
 *                           slug:
 *                             type: string
 *                             example: "electronics"
 *       404:
 *         description: Placement not found
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
 *                   example: "Placement not found"
 */
merchandisingRoutes.get("/:slug", controller.getPlacement.bind(controller));

export default merchandisingRoutes;
