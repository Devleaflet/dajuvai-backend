import { Request, Response } from 'express';
import { APIError } from '../utils/ApiError.utils';
import { AuthRequest } from '../middlewares/auth.middleware';
import { ReviewService } from '../service/review.service';
import { ICreateReviewRequest } from '../interface/review.interface';
import { UpdateReviewInput } from '../utils/zod_validations/review.zod';

/**
 * @class ReviewController
 * @description Handles HTTP requests related to product reviews.
 * Supports creating reviews by authenticated users and retrieving all reviews for a product.
 */
export class ReviewController {
    private reviewService: ReviewService;

    /**
     * @constructor
     * @description Initializes the ReviewController by setting up the ReviewService for business logic related to reviews.
     */
    constructor() {
        this.reviewService = new ReviewService();
    }

    /**
     * @method createReview
     * @route POST /reviews
     * @description Creates a new product review submitted by an authenticated user.
     * Associates the review with the authenticated user’s ID.
     * @param {AuthRequest<{}, {}, ICreateReviewRequest>} req - Authenticated request with review data in the body.
     * @param {Response} res - HTTP response object.
     * @returns {Promise<void>} Responds with the created review or appropriate error.
     * @access Authenticated
     */
    async createReview(req: AuthRequest<{}, {}, ICreateReviewRequest, {}>, res: Response) {
        try {
            // Create review through service layer with user ID from authenticated request
            const review = await this.reviewService.createReview(req.body, req.user!.id);

            // Return created review with 201 status
            res.status(201).json({ success: true, data: review });
        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Handle unexpected errors with generic 500 response
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }




    /**
     * @method getReviewsByProductId
     * @route GET /reviews/product/:productId
     * @description Retrieves all reviews for a specific product identified by its ID.
     * Includes aggregated review data and statistics.
     * @param {Request<{ productId: string }>} req - Request with product ID in route parameters.
     * @param {Response} res - HTTP response object.
     * @returns {Promise<void>} Responds with product reviews and review statistics.
     * @access Public
     */
    async getReviewsByProductId(req: Request<{ productId: string }, {}, {}, { page: number }>, res: Response) {
        try {
            const page = req.query.page;

            // Extract product ID from route parameters
            const { productId } = req.params;

            // Fetch reviews for the specified product
            const result = await this.reviewService.getReviewsByProductId(Number(productId), page);

            // Return reviews data with success status
            res.status(200).json({ success: true, data: result });
        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Handle unexpected errors with generic 500 response
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    async updateProductReview(req: AuthRequest<{ id: string }, {}, Partial<UpdateReviewInput>, {}>, res: Response) {
        try {
            const reviewId = req.params.id;

            const data = req.body;

            const reviewExists = await this.reviewService.findReviewById(Number(reviewId))

            if (!reviewExists) {
                throw new APIError(404, "Reveiw does not exists")
            }

            const userId = req.user?.id;

            if (reviewExists.userId !== userId) {
                throw new APIError(403, "You can only edit your own reviews")
            }

            const updateReview = await this.reviewService.updateReview(Number(reviewId), data)

            res.status(200).json({
                success: true,
                msg: "review updated succesfully",
                data: updateReview
            })


        } catch (err) {
            console.error(err);

            if (err instanceof APIError) {
                return res.status(err.status || 400).json({
                    success: false,
                    message: err.message || "Something went wrong",
                });
            }

            // fallback for other errors
            res.status(err.status || 500).json({
                success: false,
                message: err.message || "Internal Server Error",
            });
        }
    }


    async deleteReview(req: AuthRequest<{ id: string }, {}, {}, {}>, res: Response) {
        try {
            const reviewId = req.params.id;

            const reviewExists = await this.reviewService.findReviewById(Number(reviewId))

            if (!reviewExists) {
                throw new APIError(404, "Reveiw does not exists")
            }

            const deleteReview = await this.reviewService.deleteReview(Number(reviewId))


            res.status(200).json({
                success: true,
                msg: "Review deleted successfully"
            })


        } catch (err) {
            console.error(err);

            if (err instanceof APIError) {
                return res.status(err.status || 400).json({
                    success: false,
                    message: err.message || "Something went wrong",
                });
            }

            // fallback for other errors
            res.status(err.status || 500).json({
                success: false,
                message: err.message || "Internal Server Error",
            });
        }
    }
}