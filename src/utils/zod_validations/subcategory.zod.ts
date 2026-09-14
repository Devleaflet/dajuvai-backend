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

    // A subcategory has always had an image column and an upload path for a
    // multipart file, but no way to set it from an already-uploaded URL.
    image: z
        .string()
        .url("Image must be a valid URL")
        .optional()
        .nullable(),
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

    // Absent leaves the current image alone; null clears it.
    image: z
        .string()
        .url("Image must be a valid URL")
        .optional()
        .nullable(),
});

export type CreateSubCategoryInput = z.infer<typeof createSubCategorySchema>;
export type UpdateSubCategoryInput = z.infer<typeof updateSubcategorySchema>;
