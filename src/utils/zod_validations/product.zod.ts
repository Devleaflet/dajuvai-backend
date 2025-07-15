import { number, z } from "zod";
import { DiscountType, InventoryStatus } from "../../entities/product.entity";

/**
 * Validation schema for creating a product.
 * 
 * Fields:
 * - name: Required non-empty string.
 * - description: Required non-empty string.
 * - basePrice: Required, string input transformed to number, must be positive.
 * - stock: Required, string input transformed to integer >= 0.
 * - discount: Optional, string input transformed to number >= 0.
 * - discountType: Optional enum of DiscountType (PERCENTAGE, FLAT).
 * - size: Optional string that splits into array of non-empty trimmed strings.
 * - status: Optional enum of InventoryStatus (AVAILABLE, LOW_STOCK, OUT_OF_STOCK).
 * - quantity: Required, string input transformed to integer >= 0.
 * - brand_id: Optional string transformed to positive integer or null.
 * - dealId: Optional string transformed to positive integer or null.
 * - vendorId: Optional string transformed to number or null.
 * - userId: Optional string transformed to number or null.
 */
export const createProductSchema = z.object({
    name: z.string().min(1, "Product name is required"),
    description: z.string().min(1, "Description is required"),
    basePrice: z
        .string()
        .transform((val) => Number(val))
        .refine((val) => !isNaN(val) && val > 0, "Base price must be a positive number"),
    stock: z
        .string()
        .transform((val) => Number(val))
        .refine((val) => Number.isInteger(val) && val >= 0, "Stock must be a non-negative integer"),
    discount: z
        .string()
        .transform((val) => Number(val))
        .refine((val) => !isNaN(val) && val >= 0, "Discount cannot be negative")
        .optional(),
    discountType: z.enum([DiscountType.PERCENTAGE, DiscountType.FLAT]).optional(),

    size: z
        .string()
        .transform(val => val.split(',').map(v => v.trim()).filter(Boolean))
        .pipe(z.array(z.string().min(1)))
        .optional(),

    status: z.enum([InventoryStatus.AVAILABLE, InventoryStatus.LOW_STOCK, InventoryStatus.OUT_OF_STOCK]).optional(),

    quantity: z.string()
        .transform(val => Number(val))
        .refine(val => Number.isInteger(val) && val >= 0, "Quantity must be a non-negative integer"),

    brand_id: z
        .string()
        .transform((val) => (val ? Number(val) : null))
        .refine((val) => val === null || (Number.isInteger(val) && val > 0), "Brand ID must be a positive integer or null")
        .optional()
        .nullable(),

    dealId: z
        .string()
        .transform((val) => (val ? Number(val) : null))
        .refine((val) => val === null || (Number.isInteger(val) && val > 0), "Deal ID must be a positive integer or null")
        .optional()
        .nullable(),

    vendorId: z
        .string()
        .transform((val) => (val ? Number(val) : null))
        .optional(),

    userId: z
        .string()
        .transform((val) => (val ? Number(val) : null))
        .optional()
        .nullable(),

    bannerId: z
        .string()
        .transform((val) => (val ? Number(val) : null))
        .refine(
            (val) =>
                val === null || (Number.isInteger(val) && val > 0),
            "Banner ID must be a positive integer or null"
        )
        .optional()
        .nullable(),
});

/**
 * Partial update schema for product.
 * Allows updating any subset of fields validated by createProductSchema.
 */
export const updateProductSchema = createProductSchema.partial();

/**
 * Schema to validate product query filters.
 * Optional filters:
 * - brandId, categoryId, subcategoryId, dealId: must be positive integers if provided.                  
 * - sort: one of 'all', 'low-to-high', or 'high-to-low'. Defaults to 'all'.
 */
export const productQuerySchema = z.object({
    brandId: z
        .string()
        .transform(Number)
        .refine((val) => Number.isInteger(val) && val > 0, {
            message: "Brand ID must be a positive integer"
        })
        .optional(),

    categoryId: z
        .string()
        .transform(Number)
        .refine((val) => Number.isInteger(val) && val > 0, {
            message: "Category ID must be a positive integer"
        })
        .optional(),

    subcategoryId: z
        .string()
        .transform(Number)
        .refine((val) => Number.isInteger(val) && val > 0, {
            message: "Subcategory ID must be a positive integer"
        })
        .optional(),

    dealId: z
        .string()
        .transform(Number)
        .refine((val) => Number.isInteger(val) && val > 0, {
            message: "Deal id must be a positive integer"
        })
        .optional(),

    sort: z
        .enum(['all', 'low-to-high', 'high-to-low'])
        .optional()
        .default('all'),
}).optional().default({});

/**
 * Schema for validating admin product query pagination and sorting.
 * Fields:
 * - page: positive integer, defaults to 1.
 * - limit: positive integer, defaults to 10.
 * - sort: one of 'createdAt' or 'name', defaults to 'createdAt'.
 */
export const adminProductQuerySchema = z.object({
    page: z
        .string()
        .transform(Number)
        .refine((val) => Number.isInteger(val) && val >= 1, {
            message: "Page must be a positive integer"
        })
        .optional()
        .default('1'),

    limit: z
        .string()
        .transform(Number)
        .refine((val) => Number.isInteger(val) && val >= 1, {
            message: "Limit must be a positive integer"
        })
        .optional()
        .default('10'),

    sort: z
        .enum(['createdAt', 'name'])
        .optional()
        .default('createdAt'),
});

/**
 * Schema for validating vendor product query pagination.
 * Fields:
 * - page: positive integer, defaults to 1.
 * - limit: positive integer, defaults to 10.
 */
export const vendorProductQuerySchema = z.object({
    page: z
        .string()
        .transform(Number)
        .refine((val) => Number.isInteger(val) && val >= 1, {
            message: "Page must be a positive integer"
        })
        .optional()
        .default('1'),

    limit: z
        .string()
        .transform(Number)
        .refine((val) => Number.isInteger(val) && val >= 1, {
            message: "Limit must be a positive integer"
        })
        .optional()
        .default('10'),
});

// TypeScript types inferred from Zod schemas for strong typing
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type ProductQueryInput = z.infer<typeof productQuerySchema>;
export type AdminProductQueryInput = z.infer<typeof adminProductQuerySchema>;
export type VendorProductQueryInput = z.infer<typeof vendorProductQuerySchema>;
