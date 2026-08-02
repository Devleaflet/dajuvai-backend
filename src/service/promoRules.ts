import { PromoType } from "../entities/promo.entity";

/**
 * Pure promo-code rules — no DB access, so they are directly unit-testable.
 * The order/promo services call these so eligibility + discount math are
 * enforced in exactly one place across checkout preview (estimate), order
 * creation, and the pre-checkout /check-promo endpoint.
 */

/** Normalize a promo code: trim whitespace and upper-case. */
export const normalizePromoCode = (input: string | null | undefined): string =>
    typeof input === "string" ? input.trim().toUpperCase() : "";

export type PromoEligibilityReason =
    | "OK"
    | "NOT_FOUND"
    | "INVALID"
    | "USAGE_EXHAUSTED"
    | "ALREADY_USED";

export interface PromoEligibility {
    usable: boolean;
    reason: PromoEligibilityReason;
}

/** `maxUsageCount === 0` means unlimited. */
export const isUsageExhausted = (
    usageCount: number,
    maxUsageCount: number,
): boolean => maxUsageCount > 0 && usageCount >= maxUsageCount;

/**
 * Decide whether a promo code may be used right now. Callers pass the
 * already-resolved promo row (or null when the code doesn't exist) plus
 * whether the current user has already redeemed it (one-time-per-user
 * rule). Pure and deterministic.
 */
export const isPromoUsable = (
    promo: {
        isValid: boolean | null | undefined;
        usageCount: number;
        maxUsageCount: number;
    } | null,
    opts: { alreadyUsedByUser: boolean },
): PromoEligibility => {
    if (!promo) return { usable: false, reason: "NOT_FOUND" };
    if (promo.isValid === false) return { usable: false, reason: "INVALID" };
    if (isUsageExhausted(promo.usageCount, promo.maxUsageCount)) {
        return { usable: false, reason: "USAGE_EXHAUSTED" };
    }
    if (opts.alreadyUsedByUser) {
        return { usable: false, reason: "ALREADY_USED" };
    }
    return { usable: true, reason: "OK" };
};

/**
 * Compute the absolute discount a promo yields. LINE_TOTAL applies to
 * merchandise (before shipping), SHIPPING applies to the shipping total.
 * Returns a raw amount (no rounding) so the rest of the pipeline keeps its
 * existing precision behavior.
 */
export const calculatePromoDiscount = (
    promo: { applyOn: PromoType; discountPercentage: number },
    merchandiseSubtotal: number,
    shippingTotal: number,
): number => {
    if (!promo.discountPercentage || promo.discountPercentage <= 0) return 0;
    const rawBase =
        promo.applyOn === PromoType.SHIPPING
            ? Number(shippingTotal) || 0
            : Number(merchandiseSubtotal) || 0;
    // Clamp the base at 0 so a (theoretically impossible) negative shipping
    // total can never produce a negative discount.
    const base = Math.max(0, rawBase);
    return (base * promo.discountPercentage) / 100;
};
