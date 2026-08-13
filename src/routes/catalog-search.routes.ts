import { Router } from "express";
import rateLimit from "express-rate-limit";
import AppDataSource from "../config/db.config";
import { CatalogSearchController } from "../controllers/catalog-search.controller";
import { SearchService } from "../service/search.service";
import { asyncHandler } from "../utils/asyncHandler.utils";

const router = Router();
const controller = new CatalogSearchController(new SearchService(AppDataSource));

const catalogSearchRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many search requests. Please try again shortly.",
  },
});

/**
 * @swagger
 * /api/search/catalog:
 *   get:
 *     summary: Search products and resolve catalog taxonomy
 *     description: >
 *       Searches active catalog records. Multi-word queries require every token. Each token matches
 *       from a word start, so `elec` matches `electronics`; exact product-name matches rank ahead
 *       of prefix and full-text matches. Image URLs can be null when no image is configured.
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string, maxLength: 80 }
 *         description: Search text. Use at least two characters for useful suggestion results.
 *       - in: query
 *         name: mode
 *         schema: { type: string, enum: [suggest, catalog], default: catalog }
 *         description: suggest returns compact ranked autocomplete data; catalog returns paginated product results and filters.
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 48, default: 40 }
 *       - in: query
 *         name: categoryIds
 *         schema: { type: string, example: "7,9" }
 *         description: Optional comma-separated category IDs. Combined with text search using AND.
 *       - in: query
 *         name: subcategoryIds
 *         schema: { type: string, example: "21,25" }
 *         description: Optional comma-separated subcategory IDs. Combined with text search using AND.
 *       - in: query
 *         name: brand
 *         schema: { type: string, maxLength: 120 }
 *         description: Optional exact brand filter combined with the query.
 *         example: "Radiant"
 *       - in: query
 *         name: minPrice
 *         schema: { type: number, minimum: 0 }
 *         description: Inclusive effective-price minimum.
 *       - in: query
 *         name: maxPrice
 *         schema: { type: number, minimum: 0 }
 *         description: Inclusive effective-price maximum. Must be at least minPrice.
 *       - in: query
 *         name: minRating
 *         schema: { type: number, minimum: 1, maximum: 5 }
 *         description: Inclusive average-rating minimum.
 *       - in: query
 *         name: hasDeal
 *         schema: { type: boolean }
 *         description: When true, return only products in enabled deals.
 *       - in: query
 *         name: dealIds
 *         schema: { type: string, example: "2,3" }
 *         description: Optional comma-separated enabled deal IDs.
 *       - in: query
 *         name: bannerId
 *         schema: { type: integer, minimum: 1 }
 *         description: Restrict results to a banner's selected products or banner assignment.
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [relevance, newest, rating, price_low_high, price_high_low, discount_high_low, best_selling]
 *           default: relevance
 *     responses:
 *       200:
 *         description: Ranked products and canonical taxonomy matches
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/SearchCatalogResponse' }
 *       400:
 *         description: Invalid query
 */
router.get("/catalog", catalogSearchRateLimiter, asyncHandler(controller.search.bind(controller)));

export default router;
