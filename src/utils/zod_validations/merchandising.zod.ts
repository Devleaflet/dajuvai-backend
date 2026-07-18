import { z } from "zod";

/** Placement slugs are lower-kebab-case and come from the URL. */
export const placementSlugSchema = z
    .string()
    .trim()
    .min(1, "Placement slug is required")
    .max(100, "Placement slug cannot exceed 100 characters")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Placement slug must be lower-kebab-case");

const positiveId = z.coerce.number().int().positive();
const displayOrder = z.coerce.number().int().min(0);
export const entityTypeSchema = z.enum(["category", "subcategory"]);

export const addItemsSchema = z.object({
    items: z
        .array(z.object({ entityType: entityTypeSchema, entityId: positiveId }))
        .min(1, "items cannot be empty"),
});

export const updateVisibilitySchema = z.object({
    visible: z.boolean(),
});

/**
 * A payload naming the same itemId twice is a client bug: the array position
 * would decide displayOrder nondeterministically, so it is rejected outright
 * rather than silently taking the last occurrence.
 */
export const reorderSchema = z.object({
    items: z
        .array(z.object({ itemId: positiveId, displayOrder }))
        .min(1, "items cannot be empty")
        .refine(
            (rows) => new Set(rows.map((row) => row.itemId)).size === rows.length,
            "Duplicate itemId in reorder payload",
        ),
});

/** ?entityType=subcategory&categoryId=5 scopes the mega-menu "add subcategory" picker to one category. */
export const availableItemsQuerySchema = z.object({
    entityType: entityTypeSchema.optional(),
    categoryId: positiveId.optional(),
});

export type AddItemsInput = z.infer<typeof addItemsSchema>;
export type UpdateVisibilityInput = z.infer<typeof updateVisibilitySchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;
export type AvailableItemsQueryInput = z.infer<typeof availableItemsQuerySchema>;
