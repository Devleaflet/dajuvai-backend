import { z } from "zod";
import { PromoType } from "../../entities/promo.entity";


export const createPromoSchema = z.object({
    promoCode: z
        .string()
        .min(1, "Promo code is required"),
    discountPercentage: z
        .number()
        .min(1, "Discount must be at least 1%")
        .max(100, "Discount cannot exceed 100%"),

    applyOn: z.nativeEnum(PromoType).default(PromoType.LINE_TOTAL),

    isValid: z
        .boolean()
        .optional(),

    maxUsageCount: z
        .number()
        .int()
        .min(0, "maxUsageCount must be non-negative")
        .default(0),

    /** How many times one customer may use it. 0 is unlimited, as above. */
    maxUsagePerUser: z
        .number()
        .int()
        .min(0, "maxUsagePerUser must be non-negative")
        .default(0),
})

/**
 * `:id` for any route that addresses one promo.
 *
 * The coercion is load-bearing, not decoration: Express gives every path
 * parameter as a string, and `promoRepository.save({ id: "14", ... })` treats
 * a string primary key as unset and INSERTs, which trips the unique index on
 * `promoCode` and surfaces as a 409 on an ordinary edit.
 */
export const promoIdParamSchema = z.object({
    id: z
        .string()
        .transform(Number)
        .pipe(z.number().int().positive())
})

export const editPromoSchema = createPromoSchema.partial();

export type UpdatePromoCodeInput = z.infer<typeof editPromoSchema>;
export type CreatePromoCodeInput = z.infer<typeof createPromoSchema>;
export type PromoIdParam = z.infer<typeof promoIdParamSchema>;
