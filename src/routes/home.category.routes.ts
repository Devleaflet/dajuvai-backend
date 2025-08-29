import { Router } from "express";
import { HomeCategoryController } from "../controllers/home.category.controller";

const homecategoryRoutes = Router();
const homecategoryController = new HomeCategoryController();

/**
 * @swagger
 * /api/home/category/section:
 *   post:
 *     summary: Create or update homepage catalog categories
 *     description: Admin can select up to 5 categories to show on the homepage with their subcategories.
 *     tags:
 *       - HomeCategory
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               categoryId:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Array of category IDs (max 5)
 *             required:
 *               - categoryId
 *     responses:
 *       201:
 *         description: Catalog updated successfully
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
 *                       category:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           name:
 *                             type: string
 *                             example: Electronics
 *                           subcategories:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                   example: 10
 *                                 name:
 *                                   type: string
 *                                   example: Mobiles
 *       400:
 *         description: Validation error or more than 5 categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 msg:
 *                   type: string
 *                   example: "You can only select up to 5 categories"
 *       404:
 *         description: Category does not exist
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 msg:
 *                   type: string
 *                   example: "Category does not exist"
 *       500:
 *         description: Internal server error
 */
homecategoryRoutes.post("/", homecategoryController.createCategoryCatalog.bind(homecategoryController));

/**
 * @swagger
 * /api/home/category/section:
 *   get:
 *     summary: Get homepage catalog categories
 *     description: Fetch all categories currently selected for homepage with their subcategories.
 *     tags:
 *       - HomeCategory
 *     responses:
 *       200:
 *         description: Successfully fetched homepage categories
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
 *                       category:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           name:
 *                             type: string
 *                             example: Electronics
 *                           subcategories:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: integer
 *                                   example: 10
 *                                 name:
 *                                   type: string
 *                                   example: Mobiles
 *       500:
 *         description: Internal server error
 */
homecategoryRoutes.get("/", homecategoryController.getHomePageCategory.bind(homecategoryController));

export default homecategoryRoutes;
