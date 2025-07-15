import { z } from "zod";

/**
 * Schema to validate the creation of a SubCategory.
 * 
 * Fields:
 * - name: Required string with minimum length 1.
 */
export const createSubCategorySchema = z.object({
    name: z
        .string()
        .min(1, "Name is required"),
});

/**
 * Schema to validate updating a SubCategory.
 * 
 * Fields:
 * - name: Optional string with minimum length 1.
 *   At least one field should be provided when updating.
 */
export const updateSubcategorySchema = z.object({
    name: z
        .string()
        .min(1, 'Name is required')
        .optional(),
});

export type CreateSubCategoryInput = z.infer<typeof createSubCategorySchema>;
export type UpdateSubCategoryInput = z.infer<typeof updateSubcategorySchema>;
