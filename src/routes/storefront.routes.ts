import { Router } from "express";
import { MerchandisingController } from "../controllers/merchandising.controller";

const storefrontRoutes = Router();
const controller = new MerchandisingController();

/**
 * @swagger
 * /api/storefront/mega-menu:
 *   get:
 *     summary: Mega menu categories and subcategories, visible only, in order
 *     description: Cached; invalidated on any admin write to the mega-menu placement.
 *     tags:
 *       - Storefront
 *     responses:
 *       200:
 *         description: Ordered, visible-only mega menu
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
 *                       name:
 *                         type: string
 *                         example: "Electronics"
 *                       slug:
 *                         type: string
 *                         example: "electronics"
 *                       subcategories:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: integer
 *                               example: 10
 *                             name:
 *                               type: string
 *                               example: "Mobile Phones"
 *                             slug:
 *                               type: string
 *                               example: "mobile-phones"
 */
storefrontRoutes.get("/mega-menu", controller.getStorefrontMegaMenu.bind(controller));

/**
 * @swagger
 * /api/storefront/category-grid:
 *   get:
 *     summary: Category grid items, visible only, in order
 *     description: Cached; invalidated on any admin write to the category-grid placement.
 *     tags:
 *       - Storefront
 *     responses:
 *       200:
 *         description: Ordered, visible-only category grid
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
 *                       name:
 *                         type: string
 *                         example: "Fashion"
 *                       slug:
 *                         type: string
 *                         example: "fashion"
 *                       imageUrl:
 *                         type: string
 *                         format: uri
 *                         example: "https://example.com/categories/fashion.jpg"
 *                       displayOrder:
 *                         type: integer
 *                         example: 1
 */
storefrontRoutes.get("/category-grid", controller.getStorefrontCategoryGrid.bind(controller));

export default storefrontRoutes;
