import { Router } from "express";
import { MerchandisingController } from "../controllers/merchandising.controller";
import { responseCache } from "../middlewares/responseCache.middleware";
import { getSitemapData } from "../service/sitemap.service";
import { asyncHandler } from "../utils/asyncHandler.utils";

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

/**
 * @swagger
 * /api/storefront/sitemap:
 *   get:
 *     summary: Slugs of every public page, for the storefront sitemap
 *     description: Products follow the public catalogue visibility rule (not deleted, vendor approved and verified); stores are approved, verified vendors; sections are active homepage sections. Cached for an hour.
 *     tags:
 *       - Storefront
 *     responses:
 *       200:
 *         description: Public slugs with their last-modified time
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
 *                     products:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           slug:
 *                             type: string
 *                             example: "retro-round-frame-sunglasses"
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                     stores:
 *                       type: array
 *                       items:
 *                         type: object
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *                     sections:
 *                       type: array
 *                       items:
 *                         type: object
 */
storefrontRoutes.get(
    "/sitemap",
    responseCache({ ttlSeconds: 3600 }),
    asyncHandler(async (_req, res) => {
        res.status(200).json({ success: true, data: await getSitemapData() });
    }),
);

export default storefrontRoutes;
