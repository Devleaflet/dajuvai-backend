import { describe, expect, it } from "vitest";
import {
    createOrderSchema,
    mobileCheckoutEstimateSchema,
} from "./order.zod";

const validShippingAddress = {
    province: "Bagmati" as const,
    district: "Lalitpur",
    city: "Patan",
    streetAddress: "Pulchowk Road",
};

const validOrder = {
    shippingAddress: validShippingAddress,
    paymentMethod: "CASH_ON_DELIVERY" as const,
    phoneNumber: "9812345678",
};

describe("checkout request contracts", () => {
    it("rejects non-digit phone numbers instead of accepting malformed checkout data", () => {
        expect(() =>
            createOrderSchema.parse({ ...validOrder, phoneNumber: "98AB345678" }),
        ).toThrow();
    });

    it("requires a product for Buy Now order creation", () => {
        expect(() =>
            createOrderSchema.parse({ ...validOrder, isBuyNow: true }),
        ).toThrow();
    });

    it("requires a product for Buy Now mobile estimates", () => {
        expect(() =>
            mobileCheckoutEstimateSchema.parse({
                shippingAddress: validShippingAddress,
                isBuyNow: true,
            }),
        ).toThrow();
    });

    it("preserves supported payment and idempotency fields for checkout services", () => {
        const parsed = createOrderSchema.parse({
            ...validOrder,
            serviceCharge: 25,
            instrumentName: "Mobile Banking",
            idempotencyKey: " checkout-123 ",
        });

        expect(parsed.serviceCharge).toBe(25);
        expect(parsed.instrumentName).toBe("Mobile Banking");
        expect(parsed.idempotencyKey).toBe("checkout-123");
    });
});
