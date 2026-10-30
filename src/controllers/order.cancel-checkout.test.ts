import { describe, expect, it, vi } from "vitest";

vi.mock("../service/user.service", () => ({ findUserByEmail: vi.fn(), findUserById: vi.fn() }));

import { OrderController } from "./order.controller";

/**
 * A shopper backing out of an online payment before paying gives the held
 * stock back at once, whatever the gateway — not 30 minutes later.
 */
function fakeResponse() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

describe("OrderController.cancelCheckout", () => {
    it("ends the shopper's own pending checkout", async () => {
        const controller = Object.create(OrderController.prototype) as any;
        controller.orderService = { esewaFailed: vi.fn().mockResolvedValue({ success: true }) };
        const res = fakeResponse();

        await controller.cancelCheckout({ user: { id: 3 }, body: { draftId: 7 } }, res, vi.fn());

        expect(controller.orderService.esewaFailed).toHaveBeenCalledWith(3, undefined, 7);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ success: true });
    });
});
