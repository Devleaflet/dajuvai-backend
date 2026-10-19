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
 *         name: subcategoryLimit
 *         schema: { type: integer, minimum: 0, maximum: 4, default: 3 }
 *       - in: query
 *         name: brandLimit
 *         schema: { type: integer, minimum: 0, maximum: 4, default: 3 }
 *     responses:
 *       200:
 *         description: Ranked products, categories, subcategories, and brands.
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

/*
 * Tighter than the suggestion limiter and for a different reason: suggestions
 * are rate-limited to protect the database, this is rate-limited to stop one
 * client inventing enough outcomes to push an alias candidate over its
 * promotion threshold. A real shopper produces a handful of these a minute.
 */
const eventRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many search events. Please try again shortly." },
});

/**
 * @swagger
 * /api/search/events:
 *   post:
 *     summary: Record what a shopper did with a search result
 *     description: >
 *       Closes the search-learning loop. Outcomes accumulate against the
 *       normalized query and, once a query has enough searches and enough
 *       positive outcomes on the same row, produce an **inactive** alias
 *       candidate for an administrator to approve. Reporting an outcome never
 *       changes anyone's results on its own.
 *     tags: [Search]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [q, outcome, targetType, targetId]
 *             properties:
 *               q: { type: string, minLength: 2, maxLength: 80, example: headphones }
 *               outcome: { type: string, enum: [CLICK, ADD_TO_CART, PURCHASE], example: CLICK }
 *               targetType: { type: string, enum: [PRODUCT, CATEGORY, SUBCATEGORY], example: PRODUCT }
 *               targetId: { type: integer, minimum: 1, example: 42 }
 *     responses:
 *       202:
 *         description: Recorded. The body is not echoed.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success]
 *               properties:
 *                 success: { type: boolean, example: true }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       429: { $ref: '#/components/responses/TooManyRequests' }
 *       500: { $ref: '#/components/responses/InternalServerError' }
 */
router.post("/events", eventRateLimiter, asyncHandler(controller.recordEvent.bind(controller)));

export default router;
