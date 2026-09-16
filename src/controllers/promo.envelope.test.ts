import { describe, expect, it, vi } from "vitest";

import { PromoController } from "./promo.controller";

/**
 * Every promo write must answer with `success`, because that is the one key the
 * admin console keys its response parsing off.
 *
 * `updatePromo` used to answer `{ sucess: true }`. The write itself landed, so
 * the database was right, but the client's schema rejected the body and the
 * operator saw "Could not save this promo code" over a save that had in fact
 * succeeded — the worst failure mode available, since the obvious response is
 * to try again. The route's own swagger block documented `success` all along,
 * so this pins the implementation to its contract.
 */
function fakeResponse() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

function controllerWith(service: Record<string, unknown>) {
    const controller = new PromoController();
    (controller as any).promoService = service;
    return controller;
}

describe("promo response envelopes", () => {
    it("spells the success key correctly when updating", async () => {
        const promo = { id: 14, promoCode: "SAVE10", maxUsagePerUser: 2 };
        const controller = controllerWith({
            findPromoCodeById: vi.fn(async () => promo),
            updatePromoCodeById: vi.fn(async () => promo),
        });
        const res = fakeResponse();

        await controller.updatePromo(
            { params: { id: 14 }, body: { maxUsagePerUser: 2 } } as any,
            res,
            vi.fn() as any,
        );

        expect(res.status).toHaveBeenCalledWith(200);
        const body = res.json.mock.calls[0][0];
        expect(body).toMatchObject({ success: true, data: promo });
        expect(body).not.toHaveProperty("sucess");
    });

    it("spells it the same way on the other writes", async () => {
        const promo = { id: 14, promoCode: "SAVE10" };
        const created = controllerWith({ createPromo: vi.fn(async () => promo) });
        const createdRes = fakeResponse();
        await created.createPromo({ body: promo } as any, createdRes, vi.fn() as any);
        expect(createdRes.json.mock.calls[0][0]).toMatchObject({ success: true });

        const deleted = controllerWith({ deletePromo: vi.fn(async () => undefined) });
        const deletedRes = fakeResponse();
        await deleted.deletePromo({ params: { id: 14 } } as any, deletedRes, vi.fn() as any);
        expect(deletedRes.json.mock.calls[0][0]).toMatchObject({ success: true });
    });
});
