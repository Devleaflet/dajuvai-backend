import { describe, expect, it } from "vitest";

import { vendorPaymentOptionSchema } from "./vendor.zod";

const bank = { accountNumber: "0123456789", bankName: "Nabil Bank" };

describe("vendor payout options", () => {
    it("accepts eSewa and Khalti wallets and NPX bank payouts", () => {
        expect(vendorPaymentOptionSchema.safeParse({ paymentType: "ESEWA", details: { walletNumber: "9800000000" } }).success).toBe(true);
        expect(vendorPaymentOptionSchema.safeParse({ paymentType: "NPX", details: bank }).success).toBe(true);
    });

    it("reads the retired BANK and NPS types as NPX for older clients", () => {
        for (const paymentType of ["BANK", "NPS"]) {
            const parsed = vendorPaymentOptionSchema.parse({ paymentType, details: bank });
            expect(parsed.paymentType).toBe("NPX");
        }
    });

    it("rejects anything else, and NPX without bank details", () => {
        expect(vendorPaymentOptionSchema.safeParse({ paymentType: "PAYPAL", details: bank }).success).toBe(false);
        expect(vendorPaymentOptionSchema.safeParse({ paymentType: "NPX", details: { walletNumber: "9800000000" } }).success).toBe(false);
    });
});
