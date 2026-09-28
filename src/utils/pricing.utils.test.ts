import { describe, expect, it } from "vitest";
import { calculateGrandTotal } from "../service/shipping.service";
import { roundMoney } from "./pricing.utils";

describe("money rounding", () => {
    it("removes floating-point drift from summed prices", () => {
        // 3 × 899.55 + 250 in floating point is 2948.6499999999996.
        expect(899.55 * 3 + 250).not.toBe(2948.65);
        expect(roundMoney(899.55 * 3 + 250)).toBe(2948.65);
        expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    });

    it("gives a grand total to the paisa", () => {
        expect(
            calculateGrandTotal({
                merchandiseSubtotal: 899.55 * 3 + 250,
                discountTotal: 0,
                shippingTotal: 300,
                taxTotal: 0,
            }),
        ).toBe(3248.65);
        expect(
            calculateGrandTotal({ merchandiseSubtotal: 999.5, discountTotal: 99.95, shippingTotal: 100, taxTotal: 0 }),
        ).toBe(999.55);
    });
});
