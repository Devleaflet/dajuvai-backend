import { z } from 'zod';

/**
 * Schema to validate review creation input.
 * 
 * Fields:
 * - productId: Required positive integer (minimum 1).
 * - rating: Required number between 1.0 and 5.0 inclusive,
 *   with exactly one decimal place (e.g., 1.0, 1.1, ..., 5.0).
 * - comment: Required string, length between 1 and 500 characters.
 */
export const createReviewSchema = z.object({
    productId: z.number()
        .int()
        .positive()
        .min(1, 'Product ID is required'),
    rating: z.number()
        .min(1.0, 'Rating must be at least 1.0')
        .max(5.0, 'Rating cannot exceed 5.0')
        .refine((val) => Number(val.toFixed(1)) === val, {
            message: 'Rating must be a number with one decimal place (e.g., 1.0, 1.1, ..., 5.0)',
        }),
    comment: z.string()
        .min(1, 'Comment is required')
        .max(500, 'Comment cannot exceed 500 characters'),
});

export const updateReviewSchema = createReviewSchema.partial()

export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
