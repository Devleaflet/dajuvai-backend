import { describe, expect, it, vi } from "vitest";

import { confirmPaidNpxOrder } from "./npxSettlement";

// QA BUG-011: the NPX notification wrote `order.status = CONFIRMED` itself,
// skipping changeOrderStatus — no status history, no audit, no CONFIRMED mail.
describe("confirmPaidNpxOrder", () => {
    it("marks the order paid, then confirms it through changeOrderStatus as SYSTEM", async () => {
        const calls: string[] = [];
        const order = { id: 9, paymentStatus: "UNPAID", status: "ORDER_PLACED" } as any;
        const deps = {
            saveOrder: vi.fn(async (o: any) => {
                calls.push(`save:${o.paymentStatus}:${o.status}`);
            }),
            changeOrderStatus: vi.fn(async () => {
                calls.push("change");
            }),
        };

        await confirmPaidNpxOrder(order, deps);

        // The status itself is left for changeOrderStatus to move.
        expect(calls).toEqual(["save:PAID:ORDER_PLACED", "change"]);
        expect(deps.changeOrderStatus).toHaveBeenCalledWith(9, "CONFIRMED", {
            actorRole: "SYSTEM",
            auditActorType: "SYSTEM",
            reason: "Payment received",
        });
    });
});
