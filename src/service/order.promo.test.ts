import { describe, expect, it, vi } from "vitest";
import { OrderService } from "./order.service";
import { hasReachedPerUserLimit, isPromoUsable } from "./promoRules";

describe("OrderService promo availability", () => {
    it("identifies a promo already used by the customer", async () => {
        const service = Object.create(OrderService.prototype) as any;
        service.promoService = {
            findPromoByCode: vi.fn().mockResolvedValue({
                promoCode: "new_new",
                isValid: true,
                usageCount: 6,
                maxUsageCount: 0,
            }),
        };
        service.orderRepository = {
            createQueryBuilder: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnThis(),
                andWhere: vi.fn().mockReturnThis(),
                getCount: vi.fn().mockResolvedValue(1),
            }),
        };

        await expect(
            service.getPromoAvailability(" NEW_NEW ", 97),
        ).resolves.toEqual({ promo: null, reason: "ALREADY_USED" });
    });
});

describe("per-customer promo limits", () => {
    /**
     * The rule used to be hard-coded at one use per customer. It is now the
     * promo's own setting, and existing codes were backfilled to 1 so nothing
     * already in a customer's hands changed behaviour.
     */
    it("still refuses a second use when the promo allows one", () => {
        expect(
            isPromoUsable(
                { isValid: true, usageCount: 3, maxUsageCount: 0, maxUsagePerUser: 1 },
                { usedByUser: 1 },
            ),
        ).toEqual({ usable: false, reason: "ALREADY_USED" });
    });

    it("allows a second use when the promo allows two", () => {
        expect(
            isPromoUsable(
                { isValid: true, usageCount: 3, maxUsageCount: 0, maxUsagePerUser: 2 },
                { usedByUser: 1 },
            ),
        ).toEqual({ usable: true, reason: "OK" });
    });

    it("refuses the third when the promo allows two", () => {
        expect(
            isPromoUsable(
                { isValid: true, usageCount: 3, maxUsageCount: 0, maxUsagePerUser: 2 },
                { usedByUser: 2 },
            ),
        ).toEqual({ usable: false, reason: "ALREADY_USED" });
    });

    it("treats zero as unlimited per customer, like the total cap", () => {
        expect(
            isPromoUsable(
                { isValid: true, usageCount: 3, maxUsageCount: 0, maxUsagePerUser: 0 },
                { usedByUser: 9 },
            ),
        ).toEqual({ usable: true, reason: "OK" });
    });

    /** A row written before the column existed reads as the old behaviour. */
    it("falls back to one per customer when the promo carries no setting", () => {
        expect(
            isPromoUsable(
                { isValid: true, usageCount: 0, maxUsageCount: 0 },
                { usedByUser: 1 },
            ),
        ).toEqual({ usable: false, reason: "ALREADY_USED" });
    });

    it("lets the total cap win over an unused per-customer allowance", () => {
        expect(
            isPromoUsable(
                { isValid: true, usageCount: 5, maxUsageCount: 5, maxUsagePerUser: 3 },
                { usedByUser: 0 },
            ),
        ).toEqual({ usable: false, reason: "USAGE_EXHAUSTED" });
    });
});

describe("hasReachedPerUserLimit", () => {
    it("is never reached when the limit is zero", () => {
        expect(hasReachedPerUserLimit(100, 0)).toBe(false);
    });

    it("is reached at the limit, not after it", () => {
        expect(hasReachedPerUserLimit(1, 2)).toBe(false);
        expect(hasReachedPerUserLimit(2, 2)).toBe(true);
        expect(hasReachedPerUserLimit(3, 2)).toBe(true);
    });
});
