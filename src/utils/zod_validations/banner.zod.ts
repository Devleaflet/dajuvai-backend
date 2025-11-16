import { z } from 'zod';
import { BannerType, BannerStatus, ProductSource } from '../../entities/banner.entity';

const baseBannerSchema = z.object({
    // Banner name is required, max length 100 characters
    name: z
        .string()
        .min(1, 'Banner name is required')
        .max(100, 'Banner name cannot exceed 100 characters'),

    // Banner type must be one of the defined BannerType enum values
    type: z
        .enum([BannerType.HERO, BannerType.SIDEBAR, BannerType.PRODUCT, BannerType.SPECIAL_DEALS], {
            errorMap: () => ({ message: 'Invalid banner type' }),
        }),


    startDate: z
        .string()
        .datetime({ message: 'Invalid start date, use ISO 8601 format (e.g., 2025-06-10T00:00:00Z)' }),

    // End date must be a valid ISO 8601 datetime string
    endDate: z
        .string()
        .datetime({ message: 'Invalid end date, use ISO 8601 format (e.g., 2025-06-20T23:59:59Z)' }),

    // Product source selection
    productSource: z
        .enum([ProductSource.MANUAL, ProductSource.CATEGORY, ProductSource.SUBCATEGORY, ProductSource.DEAL, ProductSource.EXTERNAL], {
            errorMap: () => ({ message: 'Invalid product source' }),
        }),

    // For manual product selection
    selectedProducts: z
        .array(z.number())
        .optional()
        .nullable(),

    // For category selection
    selectedCategoryId: z
        .number()
        .optional()
        .nullable(),

    // For subcategory selection
    selectedSubcategoryId: z
        .number()
        .optional()
        .nullable(),

    // For deal selection
    selectedDealId: z
        .number()
        .optional()
        .nullable(),

    // For external link
    externalLink: z
        .string()
        .url('Must be a valid URL')
        .optional()
        .nullable(),

    // desktop size image 
    desktopImage: z
        .string()
        .optional()
        .nullable(),

    // mobile size image
    mobileImage: z
        .string()
        .optional()
        .nullable(),
});

// Create schema with refinements for validation rules
export const createBannerSchema = baseBannerSchema
    .refine(
        (data) => new Date(data.startDate) >= new Date(new Date().setHours(0, 0, 0, 0)),
        {
            message: 'Start date must be today or in the future',
            path: ['startDate'],
        }
    )
    .refine(
        (data) => new Date(data.startDate) <= new Date(data.endDate),
        {
            message: 'End date must be after or equal to start date',
            path: ['endDate'],
        }
    )
    .refine(
        (data) => {
            if (data.productSource === ProductSource.MANUAL) {
                return data.selectedProducts && data.selectedProducts.length > 0;
            }
            return true;
        },
        {
            message: 'At least one product must be selected for manual product source',
            path: ['selectedProducts'],
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
            message: 'Category must be selected for category product source',
            path: ['selectedCategoryId'],
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
            message: 'Both category and subcategory must be selected for subcategory product source',
            path: ['selectedSubcategoryId'],
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
            message: 'Deal must be selected for deal product source',
            path: ['selectedDealId'],
        }
    )
    .refine(
        (data) => {
            if (data.productSource === ProductSource.EXTERNAL) {
                return !!data.externalLink;
            }
            return true;
        },
        {
            message: 'External link must be provided for external product source',
            path: ['externalLink'],
        }
    );

// Update schema: all fields are optional for partial updates
export const updateBannerSchema = baseBannerSchema.partial();

// Extract TypeScript types from schemas for strong typing
export type CreateBannerInput = z.infer<typeof createBannerSchema>;
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;
