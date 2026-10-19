import { describe, expect, it } from "vitest";

import { ItemFulfillmentStatus } from "../entities/orderItems.entity";
import { sanitizeOrderForVendor } from "./sanitize.util";

const item = (overrides: Record<string, unknown> = {}) =>
    ({
        id: 1,
        vendorId: 7,
        price: "500",
        quantity: 2,
        fulfillmentStatus: ItemFulfillmentStatus.PENDING,
        ...overrides,
    }) as never;

const order = (items: unknown[]) =>
    ({
        id: 1,
        orderNumber: "DJV-1",
        status: "ORDER_PLACED",
        paymentStatus: "UNPAID",
        merchandiseSubtotal: "1000",
        discountTotal: "0",
        orderItems: items,
        vendorShippings: [],
    }) as never;

describe("sanitizeOrderForVendor settlement", () => {
    it("pays for the lines the vendor is actually sending", () => {
        const view = sanitizeOrderForVendor(order([item()]), 7);

        expect(view.itemsSubtotal).toBe(1000);
        expect(view.vendorPayable).toBe(1000);
        expect(view.cancelledItemCount).toBe(0);
    });

    /**
     * The subtotal used to sum every line the vendor had on the order,
     * cancelled ones included, so the vendor was paid for goods never sent.
     */
    it("does not pay for a cancelled line", () => {
        const view = sanitizeOrderForVendor(
            order([
                item({ id: 1 }),
                item({ id: 2, fulfillmentStatus: ItemFulfillmentStatus.CANCELLED }),
            ]),
            7,
        );

        expect(view.itemsSubtotal).toBe(1000);
        expect(view.vendorPayable).toBe(1000);
        expect(view.cancelledSubtotal).toBe(1000);
        expect(view.cancelledItemCount).toBe(1);
    });

    it("still lists the cancelled line, so the vendor can see what was dropped", () => {
        const view = sanitizeOrderForVendor(
            order([item({ id: 2, fulfillmentStatus: ItemFulfillmentStatus.CANCELLED })]),
            7,
        );

        expect(view.orderItems).toHaveLength(1);
        expect(view.itemsSubtotal).toBe(0);
        expect(view.vendorPayable).toBe(0);
    });

    it("ignores another vendor's lines entirely", () => {
        const view = sanitizeOrderForVendor(
            order([item({ id: 1 }), item({ id: 3, vendorId: 9 })]),
            7,
        );

        expect(view.orderItems).toHaveLength(1);
        expect(view.itemsSubtotal).toBe(1000);
    });
});
