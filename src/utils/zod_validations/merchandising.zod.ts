import { z } from "zod";

/**
 * Placement codes are SCREAMING_SNAKE and come from the URL, so they are
 * validated before hitting the DB.
 */
export const placementCodeSchema = z
    .string()
    .trim()
    .min(1, "Placement code is required")
    .max(64, "Placement code cannot exceed 64 characters")
    .regex(/^[A-Z0-9_]+$/, "Placement code must be uppercase letters, digits and underscores");

const positiveId = z.coerce.number().int().positive();
const displayOrder = z.coerce.number().int().min(0);

export const addCategoryToPlacementSchema = z.object({
    categoryId: positiveId,
});

export const addSubcategoryToPlacementSchema = z.object({
    subcategoryId: positiveId,
});

/**
 * A partial patch: at least one flag must be present, so an empty body is a
 * client bug rather than a silent no-op write.
 */
export const updatePlacementConfigSchema = z
    .object({
        visible: z.boolean().optional(),
        featured: z.boolean().optional(),
        pinned: z.boolean().optional(),
    })
    .refine(
        (value) => Object.keys(value).length > 0,
        "At least one of visible, featured or pinned is required",
    );

export const reorderCategoriesSchema = z
    .array(z.object({ categoryId: positiveId, displayOrder }))
    .min(1, "Reorder payload cannot be empty")
    .refine(
        (rows) => new Set(rows.map((row) => row.categoryId)).size === rows.length,
        "Duplicate categoryId in reorder payload",
    );

export const reorderSubcategoriesSchema = z
    .array(z.object({ subcategoryId: positiveId, displayOrder }))
    .min(1, "Reorder payload cannot be empty")
    .refine(
        (rows) => new Set(rows.map((row) => row.subcategoryId)).size === rows.length,
        "Duplicate subcategoryId in reorder payload",
    );

export type UpdatePlacementConfigInput = z.infer<typeof updatePlacementConfigSchema>;
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;
export type ReorderSubcategoriesInput = z.infer<typeof reorderSubcategoriesSchema>;
