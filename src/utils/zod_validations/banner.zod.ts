import { z } from 'zod';
import { BannerType, BannerStatus } from '../../entities/banner.entity';

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

    // Banner status must be one of the defined BannerStatus enum values
    status: z
        .enum([BannerStatus.ACTIVE, BannerStatus.EXPIRED, BannerStatus.SCHEDULED], {
            errorMap: () => ({ message: 'Invalid banner status' }),
        }),

    // Start date must be a valid ISO 8601 datetime string
    startDate: z
        .string()
        .datetime({ message: 'Invalid start date, use ISO 8601 format (e.g., 2025-06-10T00:00:00Z)' }),

    // End date must be a valid ISO 8601 datetime string
    endDate: z
        .string()
        .datetime({ message: 'Invalid end date, use ISO 8601 format (e.g., 2025-06-20T23:59:59Z)' }),
});

// Create schema with refinement to ensure endDate is after or equal to startDate
export const createBannerSchema = baseBannerSchema.refine(
    (data) => new Date(data.startDate) <= new Date(data.endDate),
    {
        message: 'End date must be after start date',
        path: ['endDate'],
    }
);

// Update schema: all fields are optional for partial updates
export const updateBannerSchema = baseBannerSchema.partial();

// Extract TypeScript types from schemas for strong typing
export type CreateBannerInput = z.infer<typeof createBannerSchema>;
export type UpdateBannerInput = z.infer<typeof updateBannerSchema>;
