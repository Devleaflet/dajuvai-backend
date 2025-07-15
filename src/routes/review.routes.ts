import { Router } from 'express';
import { authMiddleware, validateZod } from '../middlewares/auth.middleware';
import { createReviewSchema } from '../utils/zod_validations/review.zod';
import { ReviewController } from '../controllers/reviews.controller';

const router = Router();
const reviewController = new ReviewController();

/**
 * @swagger
 * /api/reviews:
 *   post:
 *     summary: Create a new review for a product
 *     description: Allows an authenticated user to create a review for a product.
 *     tags: [Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Review data including productId, rating, and comment
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - rating
 *               - comment
 *             properties:
 *               productId:
 *                 type: integer
 *                 example: 1
 *                 description: ID of the product being reviewed
 *               rating:
 *                 type: number
 *                 format: float
 *                 minimum: 1.0
 *                 maximum: 5.0
 *                 example: 4.5
 *                 description: Rating must be between 1.0 and 5.0 (one decimal place)
 *               comment:
 *                 type: string
 *                 maxLength: 500
 *                 example: "Great product, highly recommend!"
 *     responses:
 *       201:
 *         description: Review created successfully
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
 *                     productId:
 *                       type: integer
 *                     userId:
 *                       type: integer
 *                     rating:
 *                       type: number
 *                       format: float
 *                     comment:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error (e.g., missing fields or invalid rating)
 *       401:
 *         description: Unauthorized (user not authenticated)
 *       500:
 *         description: Internal server error
 */

router.post('/', authMiddleware, validateZod(createReviewSchema), reviewController.createReview.bind(reviewController));

/**
 * @swagger
 * /api/reviews/{productId}:
 *   get:
 *     summary: Get all reviews and average rating for a product
 *     description: Retrieve all reviews for a given product ID along with the average rating.
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: productId
 *         schema:
 *           type: integer
 *         required: true
 *         description: ID of the product to get reviews for
 *     responses:
 *       200:
 *         description: List of reviews and average rating retrieved successfully
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
 *                     averageRating:
 *                       type: number
 *                       format: float
 *                       example: 4.3
 *                     reviews:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           userId:
 *                             type: integer
 *                           rating:
 *                             type: number
 *                             format: float
 *                           comment:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *       404:
 *         description: Product not found or no reviews available
 *       500:
 *         description: Internal server error
 */
router.get('/:productId', reviewController.getReviewsByProductId.bind(reviewController));

export default router;