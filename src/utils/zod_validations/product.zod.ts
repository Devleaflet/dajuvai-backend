import { z } from "zod";
import { DiscountType, ProductSortOption } from "../../entities/product.enum";

export enum InventoryStatus {
  AVAILABLE = "AVAILABLE",
  OUT_OF_STOCK = "OUT_OF_STOCK",
  LOW_STOCK = "LOW_STOCK",
}

// Interfaces
interface Image {
  url: string;
}

interface VariantInterface {
  sku: string;
  basePrice: string; // String from form, parsed to number
  discount?: string; // Optional, defaults to "0"
  discountType?: DiscountType; // Optional, defaults to PERCENTAGE
  stock: string; // String from form, parsed to number
  status?: InventoryStatus; // Optional, defaults to AVAILABLE
  attributes: { [key: string]: string }; // e.g., { color: "White", size: "L" }
  variantImages?: string[];
}

export interface ProductInterface {
  name: string;
  brand?: string;
  description?: string;
  keywords?: string;
  basePrice?: string; // Required for non-variant products
  discount?: string; // Optional, defaults to "0"
  discountType?: DiscountType; // Optional, defaults to PERCENTAGE
  stock?: string; // Required for non-variant products
  status?: InventoryStatus; // Optional, defaults to AVAILABLE
  hasVariants: boolean | "true" | "false"; // String from form
  subcategoryId?: string; // From req.params.subcategoryId
  vendorId?: string; // From req.body or req.user.vendorId
  // brandId?: string;
  dealId?: string;
  bannerId?: string;
  variants?: VariantInterface[]; // Required if hasVariants is "true"
  productImages?: string[];
}

const ProductBaseSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  brand: z.string().min(1, "Brand is required").optional(),
  description: z.string().min(1, "Description is required").optional(),
  // make user input consistent: 'wool, cotton ,lenin' -> 'wool,cotton,lenin'
  keywords: z
    .string()
    .transform((value) => {
      const keywords = new Set(
        value
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter(Boolean),
      );

      return [...keywords].join(",");
    })
    .optional(),
  basePrice: z.preprocess(
    (value) =>
      value === "" || value === undefined ? undefined : Number(value),
    z.number().positive("Base price must be greater than zero").optional(),
  ),
  discount: z.preprocess(
    (value) =>
      value === "" || value === undefined ? undefined : Number(value),
    z.number().min(0, "Discount must be non-negative").optional(),
  ),
  discountType: z
    .enum([DiscountType.NONE, DiscountType.PERCENTAGE, DiscountType.FLAT])
    .optional(),
  status: z
    .enum([
      InventoryStatus.AVAILABLE,
      InventoryStatus.OUT_OF_STOCK,
      InventoryStatus.LOW_STOCK,
    ])
    .optional(),
  stock: z.preprocess(
    (value) =>
      value === "" || value === undefined ? undefined : Number(value),
    z.number().int().min(0, "Stock must be non-negative").optional(),
  ),
  hasVariants: z.preprocess(
    (value) => (value === "true" ? true : value === "false" ? false : value),
    z.boolean().optional(),
  ),
  variants: z
    .array(
      z.object({
        sku: z.string().min(1, "SKU is required"),
        id: z.number().int().positive().optional(),
        basePrice: z.preprocess(
          (value) =>
            value === "" || value === undefined ? undefined : Number(value),
          z
            .number()
            .positive("Variant base price must be greater than zero")
            .optional(),
        ),
        price: z.preprocess(
          (value) =>
            value === "" || value === undefined ? undefined : Number(value),
          z
            .number()
            .positive("Variant price must be greater than zero")
            .optional(),
        ),
        discount: z.preprocess(
          (value) =>
            value === "" || value === undefined ? undefined : Number(value),
          z.number().min(0, "Variant discount must be non-negative").optional(),
        ),
        discountType: z
          .enum([DiscountType.NONE, DiscountType.PERCENTAGE, DiscountType.FLAT])
          .optional(),
        stock: z.preprocess(
          (value) => Number(value),
          z.number().int().min(0, "Stock must be non-negative"),
        ),
        status: z
          .enum([
            InventoryStatus.AVAILABLE,
            InventoryStatus.OUT_OF_STOCK,
            InventoryStatus.LOW_STOCK,
          ])
          .optional(),
        attributes: z
          .union([z.record(z.string()), z.array(z.any())])
          .optional(),
        variantImages: z.array(z.string().min(1)).optional(),
        images: z
          .array(
            z.union([z.string().min(1), z.object({ url: z.string().min(1) })]),
          )
          .optional(),
      }),
    )
    .optional(),
  productImages: z
    .array(z.union([z.string().min(1), z.object({ url: z.string().min(1) })]))
    .optional(),
  subcategoryId: z
    .number()
    .int()
    .positive("Subcategory ID must be positive")
    .optional(),
  dealId: z.number().int().positive("Deal ID must be positive").optional(),
  bannerId: z.number().int().positive("Banner ID must be positive").optional(),
});

export const ProductCreateSchema = ProductBaseSchema.refine(
  (data) => {
    if (data.hasVariants === true) {
      return (
        data.variants &&
        data.variants.length > 0 &&
        data.basePrice === undefined &&
        data.stock === undefined &&
        data.productImages === undefined
      );
    } else if (data.hasVariants === false) {
      return (
        !data.variants &&
        data.basePrice !== undefined &&
        data.stock !== undefined
      );
    }
    return true;
  },
  {
    message:
      "Products with variants must have variants and no basePrice/stock/images. Non-variant products must have basePrice and stock.",
    path: ["hasVariants"],
  },
)
  .refine(
    (data) => {
      if (
        data.hasVariants !== true &&
        data.discount !== undefined &&
        data.discount > 0 &&
        data.basePrice === undefined
      ) {
        return false;
      }
      return true;
    },
    {
      message: "Discount requires discountType and basePrice to be provided.",
      path: ["discount"],
    },
  )
  .refine(
    (data) => {
      // For variant products, ensure each variant has required fields
      if (data.hasVariants === true && data.variants) {
        return data.variants.every(
          (variant) =>
            variant.sku &&
            (variant.basePrice !== undefined || variant.price !== undefined) &&
            variant.stock !== undefined &&
            variant.stock >= 0,
        );
      }
      return true;
    },
    {
      message: "Each variant must have SKU, basePrice/price, and stock.",
      path: ["variants"],
    },
  );

export const ProductUpdateSchema = ProductBaseSchema.partial();

export const ProductParamsSchema = z.object({
  id: z.number().int().positive("Product ID must be positive"),
});

export const VendorProductsQuerySchema = z.object({
  page: z
    .string()
    .regex(/^\d+$/, "page must be a positive integer")
    .transform(Number)
    .refine((n) => n >= 1, "page must be at least 1")
    .default("1"),

  limit: z
    .string()
    .refine(
      (v) => ["10", "25", "50", "100", "9999"].includes(v),
      "limit must be one of 25, 50, or 100",
    )
    .transform(Number)
    .default("10"),

  search: z
    .string()
    .trim()
    .min(1, "search cannot be empty")
    .max(100, "search is too long")
    .optional(),

  sortBy: z.nativeEnum(ProductSortOption).optional(),

  status: z.nativeEnum(InventoryStatus).optional(),
});

export type ProductCreateType = z.infer<typeof ProductCreateSchema>;
export type ProductUpdateType = z.infer<typeof ProductUpdateSchema>;
export type ProductParamsType = z.infer<typeof ProductParamsSchema>;
export type VendorProductsQueryType = z.infer<typeof VendorProductsQuerySchema>;
