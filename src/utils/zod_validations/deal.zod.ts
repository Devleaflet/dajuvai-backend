import { z } from 'zod';
import { DealStatus } from '../../entities/deal.entity';

export const createDealSchema = z.object({
    // Deal name is required, max 100 chars
    name: z
        .string()
        .min(1, 'Deal name is required')
        .max(100, 'Deal name cannot exceed 100 characters'),

    // Discount percentage between 1 and 100
    discountPercentage: z
        .number()
        .min(1, 'Discount percentage must be at least 1%')
        .max(100, 'Discount percentage cannot exceed 100%'),

    // Status must be ENABLED or DISABLED
    status: z
        .enum([DealStatus.ENABLED, DealStatus.DISABLED], { errorMap: () => ({ message: 'Invalid deal status' }) }),
});

// Partial schema for updating deals (all fields optional)
export const updateDealSchema = createDealSchema.partial();

// Types inferred from schemas
export type CreateDealInput = z.infer<typeof createDealSchema>;
export type UpdateDealInput = z.infer<typeof updateDealSchema>;
