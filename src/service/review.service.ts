import { Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import AppDataSource from '../config/db.config';
import { CreateReviewInput } from '../utils/zod_validations/review.zod';
import { APIError } from '../utils/ApiError.utils';
import { Review } from '../entities/reviews.entity';


/**
 * Service class to manage product reviews.
 * Handles creation and retrieval of reviews, ensuring business rules
 * such as one review per user per product, and calculating average ratings.
 * 
 * Belongs to the Review module.
 */
export class ReviewService {
    private reviewRepository: Repository<Review>;
    private productRepository: Repository<Product>;

    constructor() {
        // Initialize repository for Review entity to handle DB operations on reviews
        this.reviewRepository = AppDataSource.getRepository(Review);

        // Initialize repository for Product entity to validate product existence and fetch product data
        this.productRepository = AppDataSource.getRepository(Product);
    }

    /**
     * Creates a new review for a product by a user.
     * 
     * @param {CreateReviewInput} dto - The review input data including productId, rating, comment, etc.
     * @param {number} userId - The ID of the user submitting the review.
     * @returns {Promise<Review>} The saved review entity.
     * @throws {APIError} Throws 404 if product doesn't exist, 400 if user already reviewed the product.
     * @access Public (requires authenticated user)
     */
    async createReview(dto: CreateReviewInput, userId: number): Promise<Review> {

        // default value for limit is 5 
        // Check if product exists
        const product = await this.productRepository.findOne({ where: { id: dto.productId } });
        if (!product) {
            throw new APIError(404, 'Product not found');
        }

        // Check if user already reviewed this product
        const existingReview = await this.reviewRepository.findOne({
            where: { userId, productId: dto.productId },
        });
        if (existingReview) {
            throw new APIError(400, 'You have already reviewed this product');
        }

        // Create new review entity from DTO and user/product IDs
        const review = this.reviewRepository.create({
            ...dto,
            userId,
            productId: dto.productId,
        });

        return await this.reviewRepository.save(review);
    }

    /**
     * Retrieves all reviews for a given product along with the average rating.
     * 
     * @param {number} productId - The ID of the product whose reviews are requested.
     * @returns {Promise<{ reviews: Review[]; averageRating: number }>} 
     *          Object containing array of reviews and the average rating rounded to 1 decimal place.
     * @throws {APIError} Throws 404 if product doesn't exist.
     * @access Public
     */
    async getReviewsByProductId(
        productId: number,
        page: number = 1,
        limit: number = 4
    ): Promise<{ reviews: Review[]; averageRating: number; total: number; totalPages: number }> {

        // Check if product exists
        const product = await this.productRepository.findOne({ where: { id: productId } });
        if (!product) {
            throw new APIError(404, 'Product not found');
        }

        // Fetch paginated reviews with associated user info
        const [reviews, total] = await this.reviewRepository.findAndCount({
            where: { productId },
            relations: ['user'],
            order: { createdAt: 'DESC' },
            skip: (page - 1) * limit,
            take: limit,
        });

        // Calculate average rating (SQL aggregation is best for performance)
        const result = await this.reviewRepository
            .createQueryBuilder('review')
            .select('AVG(review.rating)', 'average')
            .where('review.productId = :productId', { productId })
            .getRawOne();

        const averageRating = result?.average ? Number(parseFloat(result.average).toFixed(1)) : 0;

        return {
            reviews,
            averageRating,
            total,
            totalPages: Math.ceil(total / limit),
        };
    }


    async getAverageRating(productId: number): Promise<{ avg: number; count: number }> {
        const result = await this.reviewRepository
            .createQueryBuilder("review")
            .select("AVG(review.rating)", "avg")
            .addSelect("COUNT(review.id)", "count")
            .where("review.productId = :productId", { productId })
            .getRawOne();

        const avg = result?.avg ? parseFloat(result.avg) : 0;
        const count = result?.count ? parseInt(result.count, 10) : 0;

        return {
            avg: Math.round(avg * 10) / 10,
            count,
        };
    }

}
