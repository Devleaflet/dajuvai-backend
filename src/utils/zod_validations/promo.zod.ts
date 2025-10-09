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
})

export const deletePromoSchema = z.object({
    id: z
        .string()
        .transform(Number)
        .pipe(z.number().int().positive())
})
export type CreatePromoCodeInput = z.infer<typeof createPromoSchema>;
export type DeletePromoCodeInput = z.infer<typeof deletePromoSchema>;
