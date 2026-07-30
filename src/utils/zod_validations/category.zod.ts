import { z } from 'zod';

/**
 * Shared base schema for category validation
 */
const baseCategorySchema = z.object({
    // Category name is required and must not exceed 100 characters
    name: z
        .string()
        .min(1, 'Category name is required')
        .max(100, 'Category name cannot exceed 100 characters'),

    // Image must be a valid URL if provided
    image: z
        .string()
        .url('Image must be a valid URL')
        .optional()
        .nullable(),
    isAgeRestricted: z.union([z.boolean(), z.string().transform(value => value.toLowerCase() === 'true')]).optional(),
    minimumAge: z.coerce.number().int().min(1).max(130).nullable().optional(),
    restrictionMessage: z.string().trim().max(500).nullable().optional(),
});

/**
 * Schema for creating a category
 */
export const createCategorySchema = baseCategorySchema;

/**
 * Schema for updating a category (all fields optional)
 */
export const updateCategorySchema = baseCategorySchema.partial();

/**
 * TypeScript types inferred from Zod schemas
 */
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
