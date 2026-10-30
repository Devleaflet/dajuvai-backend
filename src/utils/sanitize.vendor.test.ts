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

    it("breaks the settlement into listed price, own discount, deal, promo and payable", () => {
        const view = sanitizeOrderForVendor(
            {
                ...(order([
                    item({
                        price: "1000",
                        quantity: 2,
                        basePriceSnapshot: "1250",
                        productDiscountSnapshot: "150",
                        dealDiscountSnapshot: "100",
                        dealNameSnapshot: "Dashain Deal",
                    }),
                ]) as object),
                merchandiseSubtotal: "4000",
                discountTotal: "400",
                appliedPromoCode: "SAVE10",
                promoApplyOn: "LINE_TOTAL",
            } as never,
            7,
        );

        expect(view.settlement).toEqual({
            listedTotal: 2500,
            productDiscount: 300,
            dealDiscount: 200,
            dealNames: ["Dashain Deal"],
            itemsTotal: 2000,
            // 2,000 of the order's 4,000 merchandise → half of the Rs 400 promo.
            promo: { code: "SAVE10", amount: 200 },
            cancelled: null,
            payable: 1800,
        });
    });

    // The screenshot: a shipping promo ("ship") took Rs 0.37 off the vendor.
    it("never deducts a shipping promo from the vendor, and does not mention it", () => {
        const view = sanitizeOrderForVendor(
            {
                ...(order([item()]) as object),
                discountTotal: "100",
                appliedPromoCode: "ship",
                promoApplyOn: "SHIPPING",
            } as never,
            7,
        );

        expect(view.settlement.promo).toBeNull();
        expect(view.settlement.payable).toBe(1000);
    });

    it("shows a cancelled line as not payable, and keeps amounts to the paisa", () => {
        const view = sanitizeOrderForVendor(
            {
                ...(order([
                    item({ id: 1, price: "333.33", quantity: 1 }),
                    item({ id: 2, price: "500", quantity: 1, fulfillmentStatus: ItemFulfillmentStatus.CANCELLED }),
                ]) as object),
                merchandiseSubtotal: "1000",
                discountTotal: "100",
                appliedPromoCode: "TEN",
                promoApplyOn: "LINE_TOTAL",
            } as never,
            7,
        );

        expect(view.settlement.itemsTotal).toBe(333.33);
        expect(view.settlement.promo).toEqual({ code: "TEN", amount: 33.33 });
        expect(view.settlement.cancelled).toEqual({ count: 1, amount: 500 });
        expect(view.settlement.payable).toBe(300);
    });

    it.each(["CANCELLED", "RETURNED"])("owes nothing on a %s order, and says so", (status) => {
        const view = sanitizeOrderForVendor(
            {
                ...(order([item()]) as object),
                status,
                discountTotal: "100",
                appliedPromoCode: "TEN",
                promoApplyOn: "LINE_TOTAL",
            } as never,
            7,
        );

        expect(view.settlement.payable).toBe(0);
        expect(view.settlement.promo).toBeNull();
        expect(view.settlement.cancelled).toEqual({ count: 1, amount: 1000 });
    });

    // QA BUG-041: lines were never confirmed one by one, so a delivered or
    // cancelled order still showed every line as "Pending".
    it.each([
        ["DELIVERED", ItemFulfillmentStatus.CONFIRMED],
        ["CANCELLED", ItemFulfillmentStatus.CANCELLED],
        ["RETURNED", ItemFulfillmentStatus.CANCELLED],
        ["ORDER_PLACED", ItemFulfillmentStatus.PENDING],
    ])("shows a %s order's untouched lines as %s", (status, expected) => {
        const view = sanitizeOrderForVendor({ ...(order([item()]) as object), status } as never, 7);

        expect(view.orderItems[0].fulfillmentStatus).toBe(expected);
    });

    it("keeps a line cancelled on its own as cancelled on a delivered order", () => {
        const view = sanitizeOrderForVendor(
            {
                ...(order([item({ fulfillmentStatus: ItemFulfillmentStatus.CANCELLED })]) as object),
                status: "DELIVERED",
            } as never,
            7,
        );

        expect(view.orderItems[0].fulfillmentStatus).toBe(ItemFulfillmentStatus.CANCELLED);
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

describe("sanitizeOrderForVendor contact", () => {
    // The number the shopper gave at checkout is the one to call about this
    // order; their account's number may have changed since.
    it("carries the phone number the order was placed with", () => {
        const view = sanitizeOrderForVendor({ ...(order([item()]) as object), phoneNumber: "9812345678" } as never, 7);

        expect(view.phoneNumber).toBe("9812345678");
    });
});
