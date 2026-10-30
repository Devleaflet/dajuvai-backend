import { describe, expect, it, vi } from "vitest";

import { OrderService } from "./order.service";

/**
 * QA BUG-012: looking up someone else's merchant transaction settled or
 * expired their checkout draft (from gateway truth) before the controller
 * checked who was asking. Ownership must come first.
 */
function serviceWithDraft(draft: Record<string, unknown>) {
    const service = Object.create(OrderService.prototype) as any;
    service.orderRepository = { findOne: vi.fn().mockResolvedValue(null) };
    service.checkoutDraftRepository = {
        // Found by its NPX transaction id, for its priced total.
        findOne: vi.fn().mockResolvedValue({ mTransactionId: "TXN-1", totals: { totalPrice: 100 }, ...draft }),
        update: vi.fn(),
    };
    service.npsPaymentService = { checkTransactionStatus: vi.fn().mockResolvedValue({ status: "Failed" }) };
    service.cancelCheckoutDraft = vi.fn();
    service.materializeDraftOrder = vi.fn();
    return service;
}

describe("getOrderDetailByMerchantTransactionId ownership", () => {
    const pending = { id: 9, userId: 3, status: "PENDING", expiresAt: new Date(Date.now() + 60_000) };

    it("refuses another customer before touching the gateway or the draft", async () => {
        const service = serviceWithDraft({ ...pending });

        await expect(
            service.getOrderDetailByMerchantTransactionId("TXN-1", { requester: { id: 4, role: "user" } }),
        ).rejects.toThrow(/not authorized/i);

        expect(service.npsPaymentService.checkTransactionStatus).not.toHaveBeenCalled();
        expect(service.cancelCheckoutDraft).not.toHaveBeenCalled();
        expect(service.checkoutDraftRepository.update).not.toHaveBeenCalled();
    });

    it("refuses another customer's expired draft without expiring it", async () => {
        const service = serviceWithDraft({ ...pending, expiresAt: new Date(Date.now() - 60_000) });

        await expect(
            service.getOrderDetailByMerchantTransactionId("TXN-1", { requester: { id: 4, role: "user" } }),
        ).rejects.toThrow(/not authorized/i);
        expect(service.checkoutDraftRepository.update).not.toHaveBeenCalled();
    });

    it("still settles the owner's draft from the gateway", async () => {
        const service = serviceWithDraft({ ...pending });
        service.buildDraftOrderView = vi.fn().mockReturnValue({ id: 9 });

        await service.getOrderDetailByMerchantTransactionId("TXN-1", { requester: { id: 3, role: "user" } });

        expect(service.npsPaymentService.checkTransactionStatus).toHaveBeenCalledWith("TXN-1");
        expect(service.cancelCheckoutDraft).toHaveBeenCalled();
    });
});

describe("getOrderDetailByMerchantTransactionId on an expired hold", () => {
    const expired = { id: 9, userId: 3, status: "PENDING", expiresAt: new Date(Date.now() - 60_000) };

    it("still turns a payment the gateway confirmed into the order", async () => {
        const service = serviceWithDraft({ ...expired });
        service.npsPaymentService.checkTransactionStatus.mockResolvedValue({ status: "Success", raw: { data: { Amount: "100.00" } } });
        service.materializeDraftOrder.mockResolvedValue({ id: 77 });

        const order = await service.getOrderDetailByMerchantTransactionId("TXN-1", { requester: { id: 3, role: "user" } });

        expect(order).toEqual({ id: 77 });
    });

    it("expires it, returning the stock, when nothing was paid", async () => {
        const service = serviceWithDraft({ ...expired });
        service.npsPaymentService.checkTransactionStatus.mockResolvedValue({ status: "Pending" });
        service.endDraft = vi.fn().mockResolvedValue(true);
        service.buildDraftOrderView = vi.fn().mockReturnValue({ id: 0 });

        await service.getOrderDetailByMerchantTransactionId("TXN-1", { requester: { id: 3, role: "user" } });

        expect(service.endDraft).toHaveBeenCalledWith(9, "EXPIRED");
        expect(service.materializeDraftOrder).not.toHaveBeenCalled();
    });
});

describe("getOrderDetailByMerchantTransactionId on an ended draft", () => {
    // The hold ran out (or was cancelled) while the shopper was still paying.
    it("asks the gateway and turns a confirmed payment into the order", async () => {
        const service = serviceWithDraft({ id: 9, userId: 3, status: "EXPIRED", expiresAt: new Date(Date.now() - 60_000) });
        service.npsPaymentService.checkTransactionStatus.mockResolvedValue({ status: "Success", raw: { data: { Amount: "100.00" } } });
        service.materializeDraftOrder.mockResolvedValue({ id: 77 });

        expect(await service.getOrderDetailByMerchantTransactionId("TXN-1", { requester: { id: 3, role: "user" } })).toEqual({ id: 77 });
    });

    it("shows it cancelled when nothing was paid", async () => {
        const service = serviceWithDraft({ id: 9, userId: 3, status: "CANCELLED", expiresAt: new Date() });
        service.npsPaymentService.checkTransactionStatus.mockResolvedValue({ status: "Failed" });
        service.buildDraftOrderView = vi.fn().mockReturnValue({ id: 0, status: "CANCELLED" });

        expect(await service.getOrderDetailByMerchantTransactionId("TXN-1", { requester: { id: 3, role: "user" } })).toEqual({ id: 0, status: "CANCELLED" });
        expect(service.materializeDraftOrder).not.toHaveBeenCalled();
    });
});
