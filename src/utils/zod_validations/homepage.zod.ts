// // utils/zod_validations/homePageSection.zod.ts
// import { z } from 'zod';

// // Common field schema for the section title
// const titleSchema = z.string()
//     .min(1, 'Title is required')                      // Title must not be empty
//     .max(100, 'Title must be less than 100 characters') // Max length 100 chars
//     .trim();                                          // Trim whitespace

// // Schema for an array of product IDs (positive integers)
// const productIdsSchema = z.array(
//     z.number().int().positive('Product ID must be a positive integer')
// )
//     .min(1, 'At least one product ID is required')  // At least 1 product
//     .max(50, 'Maximum 50 products allowed per section'); // Max 50 products

// // Schema for creating a homepage section
// export const createHomePageSectionSchema = z.object({
//     title: titleSchema,                              // Section title (required)
//     isActive: z.boolean().optional().default(true), // Optional, defaults to true
//     productIds: productIdsSchema                      // List of associated product IDs
// });

// // Schema for updating a homepage section
// export const updateHomePageSectionSchema = z.object({
//     title: titleSchema.optional(),                   // Optional title update
//     isActive: z.boolean().optional(),                // Optional isActive update
//     productIds: productIdsSchema.optional()          // Optional product IDs update
// }).refine(data => {
//     // At least one field must be provided for update
//     return data.title !== undefined || data.isActive !== undefined || data.productIds !== undefined;
// }, {
//     message: 'At least one field (title, isActive, or productIds) must be provided for update'
// });

// // Schema for getting a homepage section by ID (numeric string)
// export const getHomePageSectionByIdSchema = z.object({
//     id: z.string().regex(/^\d+$/, 'ID must be a valid number') // ID must be digits only
// });

// // Schema for getting all homepage sections with optional filter
// export const getAllHomePageSectionsSchema = z.object({
//     includeInactive: z.string()
//         .optional()
//         .refine(val => val === undefined || val === 'true' || val === 'false', {
//             message: 'includeInactive must be true or false' // Only 'true' or 'false' allowed
//         })
// });

// // Schema for toggling the active status of a section by ID
// export const toggleSectionStatusSchema = z.object({
//     id: z.string().regex(/^\d+$/, 'ID must be a valid number') // ID must be digits only
// });
import { z } from "zod";
import { ProductSource } from "../../entities/banner.entity";

const baseHomePageSectionSchema = z.object({
    title: z
        .string()
        .min(1, "Section title is required")
        .max(100, "Section title cannot exceed 100 characters"),

    isActive: z.boolean().optional().default(true),

    productSource: z.enum([
        ProductSource.MANUAL,
        ProductSource.CATEGORY,
        ProductSource.SUBCATEGORY,
        ProductSource.DEAL,
    ], {
        errorMap: () => ({ message: "Invalid product source" }),
    }),

    // For manual product selection
    productIds: z.array(z.number()).optional().nullable(),

    // For category selection
    selectedCategoryId: z.number().optional().nullable(),

    // For subcategory selection
    selectedSubcategoryId: z.number().optional().nullable(),

    // For deal selection
    selectedDealId: z.number().optional().nullable(),
});


export const createHomePageSectionSchema = baseHomePageSectionSchema
    .refine(
        (data) => {
            if (data.productSource === ProductSource.MANUAL) {
                return data.productIds && data.productIds.length > 0;
            }
            return true;
        },
        {
            message: "At least one product must be selected for manual product source",
            path: ["productIds"],
        }
    )
    .refine(
        (data) => {
            if (data.productSource === ProductSource.CATEGORY) {
                return !!data.selectedCategoryId;
            }
            return true;
        },
        {
            message: "Category must be selected for category product source",
            path: ["selectedCategoryId"],
        }
    )
    .refine(
        (data) => {
            if (data.productSource === ProductSource.SUBCATEGORY) {
                return !!data.selectedCategoryId && !!data.selectedSubcategoryId;
            }
            return true;
        },
        {
            message: "Both category and subcategory must be selected for subcategory product source",
            path: ["selectedSubcategoryId"],
        }
    )
    .refine(
        (data) => {
            if (data.productSource === ProductSource.DEAL) {
                return !!data.selectedDealId;
            }
            return true;
        },
        {
            message: "Deal must be selected for deal product source",
            path: ["selectedDealId"],
        }
    );

export const updateHomePageSectionSchema = baseHomePageSectionSchema
    .partial()
    .extend({
        sectionId: z.number({ required_error: "Section ID is required" }),
    });


export type CreateHomePageSectionInput = z.infer<typeof createHomePageSectionSchema>;
export type UpdateHomePageSectionInput = z.infer<typeof updateHomePageSectionSchema>;
