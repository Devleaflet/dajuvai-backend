import { describe, expect, it } from "vitest";
import { serializeMobileCheckout } from "./mobile-checkout.serializer";

describe("serializeMobileCheckout", () => {
    it("keeps the checkout bootstrap contract stable for mobile clients", () => {
        const result = serializeMobileCheckout({
            user: {
                id: 7,
                fullName: "Ramesh Shah",
                username: "ramesh",
                email: "ramesh@example.com",
                phoneNumber: "9800000000",
                role: "user",
            },
            cart: {
                id: 3,
                total: "4200.00",
                items: [{ id: 9, productId: 12, price: "2100", quantity: "2" }],
            },
            checkoutReady: true,
            missingCheckoutFields: [],
            checkoutDefaults: {
                fullName: "Ramesh Shah",
                phoneNumber: "9800000000",
                shippingAddress: { province: "Bagmati", district: "Lalitpur" },
                paymentMethod: "CASH_ON_DELIVERY",
            },
            availablePaymentMethods: ["CASH_ON_DELIVERY", "ESEWA", "NPX"],
            checkoutEstimate: {
                merchandiseSubtotal: "4200",
                shippingTotal: "120",
                discountTotal: "300",
                taxTotal: "0",
                grandTotal: "4020",
            },
            checkoutEstimateError: null,
            priceBreakdown: null,
            vendorShippingBreakdown: [],
            totals: { grandTotal: "4020" },
        });

        expect(result.checkoutReady).toBe(true);
        expect(result.cart).toMatchObject({ id: 3, total: 4200 });
        expect(result.cart.items[0]).toMatchObject({
            id: 9,
            productId: 12,
            price: 2100,
            quantity: 2,
        });
        expect(result.checkoutEstimate).toMatchObject({
            merchandiseSubtotal: 4200,
            shippingTotal: 120,
            discountTotal: 300,
            taxTotal: 0,
            grandTotal: 4020,
        });
        expect(result.availablePaymentMethods).toEqual([
            "CASH_ON_DELIVERY",
            "ESEWA",
            "NPX",
        ]);
    });
});
