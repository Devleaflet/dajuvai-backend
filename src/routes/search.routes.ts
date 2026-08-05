import { Router } from "express";
import rateLimit from "express-rate-limit";
import AppDataSource from "../config/db.config";
import { SearchController } from "../controllers/search.controller";
import { SearchService } from "../service/search.service";
import { asyncHandler } from "../utils/asyncHandler.utils";

const router = Router();
const controller = new SearchController(new SearchService(AppDataSource));

const suggestionRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 90,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many search requests. Please try again shortly." },
});

/**
 * @swagger
 * /api/search/suggestions:
 *   get:
 *     summary: Get ranked search suggestions
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 2, maxLength: 80 }
 *         example: headphones
 *       - in: query
 *         name: productLimit
 *         schema: { type: integer, minimum: 1, maximum: 8, default: 6 }
 *       - in: query
 *         name: categoryLimit
 *         schema: { type: integer, minimum: 0, maximum: 4, default: 3 }
 *       - in: query
 *         name: brandLimit
 *         schema: { type: integer, minimum: 0, maximum: 4, default: 3 }
 *     responses:
 *       200:
 *         description: Ranked products, categories, and brands.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   $ref: '#/components/schemas/SearchSuggestionsResponse'
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *       500: { $ref: '#/components/responses/InternalServerError' }
 */
router.get("/suggestions", suggestionRateLimiter, asyncHandler(controller.getSuggestions.bind(controller)));

export default router;
