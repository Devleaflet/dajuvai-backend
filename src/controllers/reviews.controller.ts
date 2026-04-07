import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { ReviewService } from "../service/review.service";
import { ICreateReviewRequest } from "../interface/review.interface";
import { UpdateReviewInput } from "../utils/zod_validations/review.zod";
import { ForbiddenError, NotFoundError } from "../errors";

export class ReviewController {
    private reviewService: ReviewService;

    constructor() {
        this.reviewService = new ReviewService();
    }

    async createReview(req: AuthRequest<{}, {}, ICreateReviewRequest, {}>, res: Response, _next: NextFunction) {
        const review = await this.reviewService.createReview(req.body, req.user!.id);
        res.status(201).json({ success: true, data: review });
    }

    async getReviewsByProductId(req: Request<{ productId: string }, {}, {}, { page: number }>, res: Response, _next: NextFunction) {
        const result = await this.reviewService.getReviewsByProductId(Number(req.params.productId), req.query.page);
        res.status(200).json({ success: true, data: result });
    }

    async updateProductReview(req: AuthRequest<{ id: string }, {}, Partial<UpdateReviewInput>, {}>, res: Response, next: NextFunction) {
        const reviewId = Number(req.params.id);
        const reviewExists = await this.reviewService.findReviewById(reviewId);

        if (!reviewExists) throw new NotFoundError("Review");
        if (reviewExists.userId !== req.user?.id) throw new ForbiddenError("You can only edit your own reviews");

        const updateReview = await this.reviewService.updateReview(reviewId, req.body);
        res.status(200).json({ success: true, msg: "Review updated successfully", data: updateReview });
    }

    async deleteReview(req: AuthRequest<{ id: string }, {}, {}, {}>, res: Response, _next: NextFunction) {
        const reviewId = Number(req.params.id);
        const reviewExists = await this.reviewService.findReviewById(reviewId);

        if (!reviewExists) throw new NotFoundError("Review");

        await this.reviewService.deleteReview(reviewId);
        res.status(200).json({ success: true, msg: "Review deleted successfully" });
    }
}
