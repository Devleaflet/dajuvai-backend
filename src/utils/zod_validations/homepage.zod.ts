// utils/zod_validations/homePageSection.zod.ts
import { z } from 'zod';

// Common field schema for the section title
const titleSchema = z.string()
    .min(1, 'Title is required')                      // Title must not be empty
    .max(100, 'Title must be less than 100 characters') // Max length 100 chars
    .trim();                                          // Trim whitespace

// Schema for an array of product IDs (positive integers)
const productIdsSchema = z.array(
    z.number().int().positive('Product ID must be a positive integer')
)
    .min(1, 'At least one product ID is required')  // At least 1 product
    .max(50, 'Maximum 50 products allowed per section'); // Max 50 products

// Schema for creating a homepage section
export const createHomePageSectionSchema = z.object({
    title: titleSchema,                              // Section title (required)
    isActive: z.boolean().optional().default(true), // Optional, defaults to true
    productIds: productIdsSchema                      // List of associated product IDs
});

// Schema for updating a homepage section
export const updateHomePageSectionSchema = z.object({
    title: titleSchema.optional(),                   // Optional title update
    isActive: z.boolean().optional(),                // Optional isActive update
    productIds: productIdsSchema.optional()          // Optional product IDs update
}).refine(data => {
    // At least one field must be provided for update
    return data.title !== undefined || data.isActive !== undefined || data.productIds !== undefined;
}, {
    message: 'At least one field (title, isActive, or productIds) must be provided for update'
});

// Schema for getting a homepage section by ID (numeric string)
export const getHomePageSectionByIdSchema = z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a valid number') // ID must be digits only
});

// Schema for getting all homepage sections with optional filter
export const getAllHomePageSectionsSchema = z.object({
    includeInactive: z.string()
        .optional()
        .refine(val => val === undefined || val === 'true' || val === 'false', {
            message: 'includeInactive must be true or false' // Only 'true' or 'false' allowed
        })
});

// Schema for toggling the active status of a section by ID
export const toggleSectionStatusSchema = z.object({
    id: z.string().regex(/^\d+$/, 'ID must be a valid number') // ID must be digits only
});
