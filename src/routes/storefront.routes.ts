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
 */
storefrontRoutes.get("/category-grid", controller.getStorefrontCategoryGrid.bind(controller));

export default storefrontRoutes;
