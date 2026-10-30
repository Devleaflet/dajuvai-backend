import { describe, expect, it, vi } from "vitest";

const userService = vi.hoisted(() => ({
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
}));
vi.mock("../service/user.service", () => userService);

import { OrderController } from "./order.controller";

function fakeResponse() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

const message = (fn: () => Promise<unknown>) =>
    fn().then(
        () => "resolved",
        (error: Error) => error.message,
    );

describe("public order tracking (QA BUG-018)", () => {
    it("answers an unknown email exactly as it answers an unknown order", async () => {
        const controller = Object.create(OrderController.prototype) as any;
        controller.orderService = {
            trackOrder: vi.fn().mockRejectedValue(new Error("Order does not exist or does not belong to the user")),
        };
        const track = (email: string) =>
            controller.trackOrderById({ query: { orderId: "DJV-X", email } }, fakeResponse(), vi.fn());

        userService.findUserByEmail.mockResolvedValueOnce(null);
        const unknownEmail = await message(() => track("nobody@example.com"));
        userService.findUserByEmail.mockResolvedValueOnce({ id: 3 });
        const unknownOrder = await message(() => track("known@example.com"));

        expect(unknownEmail).toBe(unknownOrder);
    });
});

describe("promo check (QA BUG-019)", () => {
    it("returns only what the shopper needs, not the promo's internal counters", async () => {
        const controller = Object.create(OrderController.prototype) as any;
        controller.orderService = {
            checkAvailablePromocode: vi.fn().mockResolvedValue({
                id: 1,
                promoCode: "QA10",
                discountPercentage: 10,
                applyOn: "LINE_TOTAL",
                isValid: true,
                maxUsageCount: 100,
                usageCount: 37,
                maxUsagePerUser: 1,
                createdAt: "2026-10-29",
                updatedAt: "2026-10-29",
            }),
        };
        const res = fakeResponse();

        await controller.checkAvailablePromocode({ body: { promoCode: "QA10" }, user: { id: 3 } }, res, vi.fn());

        expect(res.json).toHaveBeenCalledWith({
            success: true,
            data: { promoCode: "QA10", discountPercentage: 10, applyOn: "LINE_TOTAL" },
        });
    });
});

describe("public order tracking result", () => {
    // Order number and email are proof enough to see how the order is doing,
    // not who it is going to.
    it("shows the order's progress and totals, and nothing about the person", async () => {
        const controller = Object.create(OrderController.prototype) as any;
        controller.orderService = {
            trackOrder: vi.fn().mockResolvedValue({
                id: 9,
                orderNumber: "DJV-9",
                status: "ASSIGNED_TO_RIDER",
                createdAt: "2026-10-30T10:00:00Z",
                paymentMethod: "CASH_ON_DELIVERY",
                paymentStatus: "UNPAID",
                totalPrice: "1099.55",
                orderItems: [
                    { vendorId: 7, quantity: 2, price: "450", fulfillmentStatus: "PENDING" },
                    { vendorId: 7, quantity: 1, price: "99.55", fulfillmentStatus: "PENDING" },
                ],
                vendorShippings: [{ vendorId: 7, shippingFee: "100" }],
                orderedBy: { email: "asha@example.com", fullName: "Asha", phoneNumber: "9812345678" },
                shippingAddress: { city: "Patan" },
                phoneNumber: "9812345678",
            }),
            getCustomerStatusTimeline: vi.fn().mockResolvedValue([
                { status: "ORDER_PLACED", reason: null, at: "2026-10-30T10:00:00Z" },
                { status: "ASSIGNED_TO_RIDER", reason: null, at: "2026-10-31T09:00:00Z" },
            ]),
        };
        const res = fakeResponse();

        await controller.trackOrderById({ query: { orderId: "DJV-9", email: "asha@example.com" } }, res, vi.fn());

        const body = res.json.mock.calls[0][0];
        expect(body.orderStatus).toBe("ASSIGNED_TO_RIDER");
        expect(body.order).toEqual({
            orderNumber: "DJV-9",
            status: "ASSIGNED_TO_RIDER",
            createdAt: "2026-10-30T10:00:00Z",
            paymentMethod: "CASH_ON_DELIVERY",
            paymentStatus: "UNPAID",
            finalTotal: 1099.55,
            itemCount: 3,
            statusHistory: [
                { status: "ORDER_PLACED", reason: null, at: "2026-10-30T10:00:00Z" },
                { status: "ASSIGNED_TO_RIDER", reason: null, at: "2026-10-31T09:00:00Z" },
            ],
        });
        expect(JSON.stringify(body)).not.toMatch(/Asha|9812345678|Patan/);
    });
});
