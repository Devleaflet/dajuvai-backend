
import { z } from "zod";

// Enums
export enum DiscountType {
    PERCENTAGE = 'PERCENTAGE',
    FLAT = 'FLAT',
}

export enum InventoryStatus {
    AVAILABLE = 'AVAILABLE',
    OUT_OF_STOCK = 'OUT_OF_STOCK',
    LOW_STOCK = 'LOW_STOCK',
}

// Interfaces
interface Image {
    url: string;
}

export interface ProductInterface {
    name?: string;
    description?: string;
    basePrice?: number;
    discount?: number;
    discountType?: DiscountType;
    status?: InventoryStatus;
    stock?: number;
    hasVariants?: boolean;
    variants?: {
        sku: string;
        price: number;
        stock: number;
        status: InventoryStatus;
        attributes?: { attributeType: string; attributeValues: string[] }[];
        images?: Image[];
    }[];
    productImages?: Image[];
    subcategoryId?: number;
    dealId?: number;
    bannerId?: number;
}

const ProductBaseSchema = z.object({
    name: z.string().min(1, "Name is required").optional(),
    description: z.string().min(1, "Description is required").optional(),
    basePrice: z.number().min(0, "Base price must be non-negative").optional(),
    discount: z.number().min(0, "Discount must be non-negative").max(100, "Discount cannot exceed 100").optional(),
    discountType: z.enum([DiscountType.PERCENTAGE, DiscountType.FLAT]).optional(),
    status: z.enum([InventoryStatus.AVAILABLE, InventoryStatus.OUT_OF_STOCK, InventoryStatus.LOW_STOCK]).optional(),
    stock: z.number().int().min(0, "Stock must be non-negative").optional(),
    hasVariants: z.boolean().optional(),
    variants: z.array(
        z.object({
            sku: z.string().min(1, "SKU is required"),
            price: z.number().min(0, "Price must be non-negative"),
            stock: z.number().int().min(0, "Stock must be non-negative"),
            status: z.enum([InventoryStatus.AVAILABLE, InventoryStatus.OUT_OF_STOCK, InventoryStatus.LOW_STOCK]),
            attributes: z.array(
                z.object({
                    attributeType: z.string().min(1, "Attribute type is required"),
                    attributeValues: z.array(z.string().min(1, "Attribute value is required")).min(1, "At least one attribute value is required"),
                })
            ).optional(),
            images: z.array(z.object({ url: z.string().url("Invalid image URL") })).optional(),
        })
    ).optional(),
    productImages: z.array(z.object({ url: z.string().url("Invalid image URL") })).optional(),
    subcategoryId: z.number().int().positive("Subcategory ID must be positive").optional(),
    dealId: z.number().int().positive("Deal ID must be positive").optional(),
    bannerId: z.number().int().positive("Banner ID must be positive").optional(),
});

export const ProductCreateSchema = ProductBaseSchema.refine(
    (data) => {
        if (data.hasVariants === true) {
            return data.variants && data.variants.length > 0 &&
                data.basePrice === undefined &&
                data.stock === undefined &&
                data.productImages === undefined;
        } else if (data.hasVariants === false) {
            return !data.variants && data.basePrice !== undefined && data.stock !== undefined;
        }
        return true;
    },
    {
        message: "Products with variants must have variants and no basePrice/stock/images. Non-variant products must have basePrice and stock.",
        path: ["hasVariants"],
    }
).refine(
    (data) => {
        if (data.discount !== undefined && (data.discountType === undefined || data.basePrice === undefined)) {
            return false;
        }
        return true;
    },
    {
        message: "Discount requires discountType and basePrice to be provided.",
        path: ["discount"],
    }
);

export const ProductUpdateSchema = ProductBaseSchema.partial();

export const ProductParamsSchema = z.object({
    id: z.number().int().positive("Product ID must be positive"),
});

export type ProductCreateType = z.infer<typeof ProductCreateSchema>;
export type ProductUpdateType = z.infer<typeof ProductUpdateSchema>;
export type ProductParamsType = z.infer<typeof ProductParamsSchema>;