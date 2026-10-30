import { afterEach, describe, expect, it, vi } from "vitest";

const { checkEsewaStatus, sendTransactionalEmail } = vi.hoisted(() => ({
    checkEsewaStatus: vi.fn(),
    sendTransactionalEmail: vi.fn(),
}));
vi.mock("../utils/esewa.util", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../utils/esewa.util")>()),
    checkEsewaStatus,
}));
vi.mock("../utils/nodemailer.utils", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../utils/nodemailer.utils")>()),
    sendTransactionalEmail,
}));

import { OrderService } from "./order.service";

/**
 * A shopper who pays and never comes back — closed the tab, lost signal,
 * the app was killed on the gateway page — has no return trip to settle the
 * payment on, and eSewa sends no webhook. Before a lapsed hold gives the
 * stock away, the gateway is asked whether it was paid.
 */
const MINUTE = 60_000;

function serviceWith(drafts: Record<string, unknown>[]) {
    const service = Object.create(OrderService.prototype) as any;
    service.checkoutDraftRepository = { find: vi.fn().mockResolvedValue(drafts) };
    service.npsPaymentService = { checkTransactionStatus: vi.fn() };
    service.endDraft = vi.fn().mockResolvedValue(true);
    service.materializeDraftOrder = vi.fn().mockResolvedValue({ id: 77 });
    return service;
}

const esewaDraft = (overrides: Record<string, unknown> = {}) => ({
    id: 5,
    userId: 3,
    status: "PENDING",
    esewaTransactionUuid: "uuid-5",
    totals: { totalPrice: 1250 },
    expiresAt: new Date(Date.now() - MINUTE),
    ...overrides,
});

const npxDraft = (overrides: Record<string, unknown> = {}) => ({
    id: 6,
    userId: 3,
    status: "PENDING",
    mTransactionId: "TXN_6",
    totals: { totalPrice: 1250 },
    expiresAt: new Date(Date.now() - MINUTE),
    ...overrides,
});

afterEach(() => vi.clearAllMocks());

describe("a lapsed hold the shopper paid for", () => {
    it("becomes the eSewa order instead of expiring", async () => {
        checkEsewaStatus.mockResolvedValue("COMPLETE");
        const service = serviceWith([esewaDraft()]);

        await service.expireStaleCheckoutDrafts(new Date());

        expect(checkEsewaStatus).toHaveBeenCalledWith("uuid-5", 1250);
        expect(service.materializeDraftOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), "uuid-5");
        expect(service.endDraft).not.toHaveBeenCalled();
    });

    it("becomes the NPX order when the gateway collected the draft's total", async () => {
        const service = serviceWith([npxDraft()]);
        service.npsPaymentService.checkTransactionStatus.mockResolvedValue({
            status: "Success",
            raw: { data: { Amount: "1250.00" } },
        });

        await service.expireStaleCheckoutDrafts(new Date());

        expect(service.materializeDraftOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 6 }), "TXN_6");
        expect(service.endDraft).not.toHaveBeenCalled();
    });
});

describe("a lapsed hold nobody paid for", () => {
    it("expires, returning the stock, when eSewa never saw the payment", async () => {
        checkEsewaStatus.mockResolvedValue("NOT_FOUND");
        const service = serviceWith([esewaDraft()]);

        expect(await service.expireStaleCheckoutDrafts(new Date())).toBe(1);
        expect(service.endDraft).toHaveBeenCalledWith(5, "EXPIRED");
        expect(service.materializeDraftOrder).not.toHaveBeenCalled();
    });

    it("expires without asking anyone when the shopper never reached a gateway", async () => {
        const service = serviceWith([{ id: 7, status: "PENDING", totals: { totalPrice: 1250 }, expiresAt: new Date() }]);

        expect(await service.expireStaleCheckoutDrafts(new Date())).toBe(1);
        expect(checkEsewaStatus).not.toHaveBeenCalled();
        expect(service.npsPaymentService.checkTransactionStatus).not.toHaveBeenCalled();
    });
});

describe("a lapsed hold the gateway can't answer for yet", () => {
    it("keeps holding while the shopper may still be paying", async () => {
        checkEsewaStatus.mockResolvedValue("PENDING");
        const service = serviceWith([esewaDraft()]);

        expect(await service.expireStaleCheckoutDrafts(new Date())).toBe(0);
        expect(service.endDraft).not.toHaveBeenCalled();
    });

    it("keeps holding while the gateway is unreachable", async () => {
        const service = serviceWith([npxDraft()]);
        service.npsPaymentService.checkTransactionStatus.mockResolvedValue({ status: "Unknown", raw: null });

        expect(await service.expireStaleCheckoutDrafts(new Date())).toBe(0);
        expect(service.endDraft).not.toHaveBeenCalled();
    });

    it("gives the stock back once the grace period is over", async () => {
        checkEsewaStatus.mockResolvedValue("UNKNOWN");
        const service = serviceWith([esewaDraft({ expiresAt: new Date(Date.now() - 31 * MINUTE) })]);

        expect(await service.expireStaleCheckoutDrafts(new Date())).toBe(1);
        expect(service.endDraft).toHaveBeenCalledWith(5, "EXPIRED");
    });
});

describe("OrderService.draftPaymentVerdict", () => {
    it("never calls an NPX payment of a different amount a success", async () => {
        const service = serviceWith([]);
        service.npsPaymentService.checkTransactionStatus.mockResolvedValue({
            status: "Success",
            raw: { data: { Amount: "10.00" } },
        });
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

        expect(await service.draftPaymentVerdict(npxDraft())).toBe("Unknown");
        expect(log).toHaveBeenCalledWith(expect.stringContaining("draft 6"));
        log.mockRestore();
    });

    it("reads a refunded eSewa payment as not paid", async () => {
        checkEsewaStatus.mockResolvedValue("FULL_REFUND");
        expect(await serviceWith([]).draftPaymentVerdict(esewaDraft())).toBe("Failed");
    });
});

describe("the NPX status lookup", () => {
    it("does not turn a payment of the wrong amount into an order", async () => {
        const service = serviceWith([]);
        service.orderRepository = { findOne: vi.fn().mockResolvedValue(null) };
        service.checkoutDraftRepository.findOne = vi.fn().mockResolvedValue(npxDraft({ expiresAt: new Date(Date.now() + MINUTE) }));
        service.npsPaymentService.checkTransactionStatus.mockResolvedValue({
            status: "Success",
            raw: { data: { Amount: "10.00" } },
        });
        service.buildDraftOrderView = vi.fn().mockReturnValue({ id: 0 });
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        await service.getOrderDetailByMerchantTransactionId("TXN_6", { requester: { id: 3, role: "user" } });

        expect(service.materializeDraftOrder).not.toHaveBeenCalled();
    });
});

describe("a paid checkout that can't become an order", () => {
    const paidDraft = { id: 5, userId: 3, status: "PENDING", orderNumber: "DV-123", totals: { totalPrice: 1250 }, paymentMethod: "ESEWA" };

    function failingService(flagUpdated: number) {
        const service = Object.create(OrderService.prototype) as any;
        service.shippingService = { resolveDistrictByName: vi.fn().mockResolvedValue(null) };
        service.lockShopperCheckout = vi.fn().mockRejectedValue(new Error("sold out"));
        service.endDraft = vi.fn().mockResolvedValue(true);
        service.checkoutDraftRepository = { query: vi.fn().mockResolvedValue([[], flagUpdated]) };
        sendTransactionalEmail.mockResolvedValue("sent");
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        return service;
    }

    it("tells the team, with what they need to refund it", async () => {
        const service = failingService(1);

        await expect(service.materializeDraftOrder(paidDraft, "uuid-5")).rejects.toThrow(/payment was received/i);

        expect(sendTransactionalEmail).toHaveBeenCalledWith(
            expect.any(String),
            expect.stringContaining("DV-123"),
            expect.stringMatching(/uuid-5[\s\S]*1250|1250[\s\S]*uuid-5/),
        );
    });

    it("tells them once, however often the shopper's page asks again", async () => {
        const service = failingService(0);

        await expect(service.materializeDraftOrder(paidDraft, "uuid-5")).rejects.toThrow(/payment was received/i);

        expect(sendTransactionalEmail).not.toHaveBeenCalled();
    });
});

describe("OrderService.settleLatePayments", () => {
    // Paid on eSewa, the redirect back was lost, and the shopper started a
    // new checkout — which ends their pending ones. eSewa won't call back.
    function serviceWithEnded(drafts: Record<string, unknown>[]) {
        const service = serviceWith([]);
        const qb: any = {
            where: vi.fn(() => qb),
            andWhere: vi.fn(() => qb),
            getMany: vi.fn().mockResolvedValue(drafts),
        };
        service.checkoutDraftRepository.createQueryBuilder = vi.fn(() => qb);
        return { service, qb };
    }

    it("turns a recently ended checkout the gateway says was paid into the order", async () => {
        checkEsewaStatus.mockResolvedValue("COMPLETE");
        const { service } = serviceWithEnded([esewaDraft({ status: "CANCELLED" })]);

        expect(await service.settleLatePayments()).toBe(1);
        expect(service.materializeDraftOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), "uuid-5");
    });

    it("leaves unpaid ones ended", async () => {
        checkEsewaStatus.mockResolvedValue("NOT_FOUND");
        const { service } = serviceWithEnded([esewaDraft({ status: "EXPIRED" })]);

        expect(await service.settleLatePayments()).toBe(0);
        expect(service.materializeDraftOrder).not.toHaveBeenCalled();
    });

    it("only looks at recently ended checkouts that reached a gateway and aren't with the team already", async () => {
        const { service, qb } = serviceWithEnded([]);

        await service.settleLatePayments();

        const clauses = [...qb.where.mock.calls, ...qb.andWhere.mock.calls].map((c: unknown[]) => c[0]).join(" ");
        expect(clauses).toMatch(/status IN/);
        expect(clauses).toMatch(/esewaTransactionUuid IS NOT NULL OR .*mTransactionId IS NOT NULL/);
        expect(clauses).toMatch(/paidWithoutOrderAt/);
        // The database stamped updatedAt, so its clock measures the window.
        expect(qb.andWhere).toHaveBeenCalledWith(expect.stringMatching(/updatedAt > now\(\)/), { minutes: 60 });
    });

    it("keeps going past one that fails", async () => {
        checkEsewaStatus.mockResolvedValue("COMPLETE");
        const { service } = serviceWithEnded([esewaDraft({ id: 1 }), esewaDraft({ id: 2 })]);
        service.materializeDraftOrder.mockRejectedValueOnce(new Error("sold out"));
        vi.spyOn(console, "error").mockImplementation(() => undefined);

        expect(await service.settleLatePayments()).toBe(1);
    });
});
