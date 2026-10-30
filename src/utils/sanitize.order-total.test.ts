import { describe, expect, it } from "vitest";

import { sanitizeOrderFull } from "./sanitize.util";

/**
 * What the customer owes once lines are cancelled. A seller whose every
 * line was cancelled delivers nothing, so their delivery fee goes too —
 * before, a fully cancelled order still showed "Total Rs 100".
 */
const line = (vendorId: number, price: number, status: string) => ({
    vendorId,
    price,
    unitPriceSnapshot: price,
    quantity: 1,
    fulfillmentStatus: status,
});

const order = (overrides: Record<string, unknown>) =>
    sanitizeOrderFull({
        id: 1,
        status: "ORDER_PLACED",
        discountTotal: 0,
        ...overrides,
    } as any);

describe("sanitizeOrderFull finalTotal", () => {
    it("owes nothing once every line is cancelled, delivery included", () => {
        const o = order({
            totalPrice: 490,
            shippingFee: 100,
            orderItems: [line(7, 390, "CANCELLED")],
            vendorShippings: [{ vendorId: 7, shippingFee: 100 }],
        });

        expect(o.finalTotal).toBe(0);
        expect(o.cancelledAmount).toBe(490);
    });

    it("keeps the delivery of a seller who still has lines to deliver", () => {
        const o = order({
            totalPrice: 900,
            shippingFee: 200,
            orderItems: [line(7, 300, "CANCELLED"), line(7, 100, "PENDING"), line(8, 300, "CANCELLED")],
            vendorShippings: [
                { vendorId: 7, shippingFee: 100 },
                { vendorId: 8, shippingFee: 100 },
            ],
        });

        // Seller 8 is gone entirely (300 + its 100 delivery); seller 7 still ships.
        expect(o.cancelledAmount).toBe(700);
        expect(o.finalTotal).toBe(200);
    });

    it("drops the whole delivery when every line is cancelled and no per-seller rows were loaded", () => {
        const o = order({
            totalPrice: 490,
            shippingFee: 100,
            orderItems: [line(7, 390, "CANCELLED")],
        });

        expect(o.finalTotal).toBe(0);
    });

    it("owes nothing on a cancelled order, whatever its lines say", () => {
        const o = order({
            status: "CANCELLED",
            totalPrice: 490,
            shippingFee: 100,
            orderItems: [line(7, 390, "PENDING")],
        });

        expect(o.finalTotal).toBe(0);
        expect(o.cancelledAmount).toBe(490);
    });

    it("leaves an order with nothing cancelled alone", () => {
        const o = order({
            totalPrice: 490,
            shippingFee: 100,
            orderItems: [line(7, 390, "PENDING")],
            vendorShippings: [{ vendorId: 7, shippingFee: 100 }],
        });

        expect(o.finalTotal).toBe(490);
        expect(o.cancelledAmount).toBe(0);
    });
});
