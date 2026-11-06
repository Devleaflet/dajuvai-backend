import { describe, expect, it, vi } from "vitest";

const { transaction } = vi.hoisted(() => ({ transaction: vi.fn() }));
vi.mock("../config/db.config", () => {
    const dataSource = { transaction, getRepository: () => ({}), manager: {} };
    return { default: dataSource, AppDataSource: dataSource };
});

import { OrderService } from "./order.service";

/**
 * Online payments hold the stock while the shopper pays, so two shoppers
 * paying for the last unit can't both be charged for it. A hold that never
 * becomes an order puts the stock back — exactly once.
 */
function draftRow(overrides: Record<string, unknown> = {}) {
    return {
        id: 5,
        userId: 3,
        status: "PENDING",
        stockHeld: true,
        items: [{ productId: 1, variantId: null, quantity: 2, price: 100 }],
        ...overrides,
    };
}

function serviceWith(row: Record<string, unknown> | null) {
    const repo = { findOne: vi.fn().mockResolvedValue(row), update: vi.fn() };
    const manager = { getRepository: () => repo };
    transaction.mockImplementation((work: any) => work(manager));
    const service = Object.create(OrderService.prototype) as any;
    service.restoreStock = vi.fn();
    return { service, repo, manager };
}

describe("OrderService.endDraft", () => {
    it("puts held stock back and ends the draft", async () => {
        const { service, repo } = serviceWith(draftRow());

        expect(await service.endDraft(5, "EXPIRED")).toBe(true);

        expect(repo.findOne).toHaveBeenCalledWith(expect.objectContaining({ lock: { mode: "pessimistic_write" } }));
        expect(service.restoreStock).toHaveBeenCalledWith([{ productId: 1, variantId: null, quantity: 2, price: 100 }], expect.anything());
        expect(repo.update).toHaveBeenCalledWith(5, { status: "EXPIRED", stockHeld: false, promoHeld: false });
    });

    it("does nothing to a draft another caller already ended", async () => {
        const { service, repo } = serviceWith(draftRow({ status: "CANCELLED", stockHeld: false }));

        expect(await service.endDraft(5, "EXPIRED")).toBe(false);
        expect(service.restoreStock).not.toHaveBeenCalled();
        expect(repo.update).not.toHaveBeenCalled();
    });

    it("ends an old draft that held nothing without touching stock", async () => {
        const { service, repo } = serviceWith(draftRow({ stockHeld: false }));

        expect(await service.endDraft(5, "CANCELLED")).toBe(true);
        expect(service.restoreStock).not.toHaveBeenCalled();
        expect(repo.update).toHaveBeenCalledWith(5, { status: "CANCELLED", stockHeld: false, promoHeld: false });
    });
});

describe("OrderService.expireStaleCheckoutDrafts", () => {
    it("ends every stale draft through endDraft, counting the ones it ended", async () => {
        const service = Object.create(OrderService.prototype) as any;
        service.checkoutDraftRepository = { find: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) };
        service.endDraft = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);

        expect(await service.expireStaleCheckoutDrafts(new Date())).toBe(1);
        expect(service.endDraft).toHaveBeenCalledWith(1, "EXPIRED");
        expect(service.endDraft).toHaveBeenCalledWith(2, "EXPIRED");
    });
});

describe("OrderService.cancelCheckoutDraft", () => {
    it("returns a pending draft's stock", async () => {
        const service = Object.create(OrderService.prototype) as any;
        service.endDraft = vi.fn().mockResolvedValue(true);

        await service.cancelCheckoutDraft({ id: 5, status: "PENDING" }, "Gateway reported failure");
        expect(service.endDraft).toHaveBeenCalledWith(5, "CANCELLED");
    });
});

describe("expiring drafts when one can't be ended", () => {
    it("keeps sweeping past a draft that fails, and says which", async () => {
        const service = Object.create(OrderService.prototype) as any;
        service.checkoutDraftRepository = { find: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) };
        service.endDraft = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(true);
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);

        expect(await service.expireStaleCheckoutDrafts(new Date())).toBe(1);
        expect(service.endDraft).toHaveBeenCalledWith(2, "EXPIRED");
        expect(log).toHaveBeenCalledWith(expect.stringContaining("draft 1"), expect.any(Error));
        log.mockRestore();
    });
});

describe("OrderService.endOwnPendingDrafts", () => {
    // Two tabs can leave a shopper with two pending drafts; locking them all
    // up front, in id order, keeps "draft rows first" true for the whole set.
    it("locks every pending draft in id order before ending any", async () => {
        const order: string[] = [];
        const manager = {
            query: vi.fn(async (sql: string, _args?: unknown[]) => {
                order.push(sql.includes("FOR UPDATE") ? "lock" : sql);
                return [{ id: 4 }, { id: 9 }];
            }),
        };
        const service = Object.create(OrderService.prototype) as any;
        service.endDraft = vi.fn(async (id: number) => {
            order.push(`end ${id}`);
            return true;
        });

        await service.endOwnPendingDrafts(3, manager);

        expect(manager.query.mock.calls[0][0]).toMatch(/ORDER BY id FOR UPDATE/);
        expect(manager.query.mock.calls[0][1]).toEqual([3]);
        expect(order).toEqual(["lock", "end 4", "end 9"]);
    });
});

describe("OrderService.restoreStock on a deleted product", () => {
    function qb(rows: any[]) {
        const builder: any = {};
        for (const k of ["select", "setLock", "where", "orderBy", "withDeleted"]) builder[k] = vi.fn(() => builder);
        builder.getMany = vi.fn().mockResolvedValue(rows);
        return builder;
    }

    it("returns stock to a soft-deleted row and skips a row that is gone", async () => {
        const products = [{ id: 1, stock: 0, deletedAt: new Date() }];
        const productQb = qb(products);
        const productRepo = { createQueryBuilder: () => productQb, save: vi.fn() };
        const variantRepo = { createQueryBuilder: () => qb([]), save: vi.fn() };
        const manager = { getRepository: (e: any) => (e.name === "Variant" ? variantRepo : productRepo) };
        const service = Object.create(OrderService.prototype) as any;
        service.lockStockRows = vi.fn();
        service.syncVariantParentProducts = vi.fn();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        await service.restoreStock([{ productId: 1, quantity: 2 }, { productId: 2, quantity: 1 }], manager);

        expect(productQb.withDeleted).toHaveBeenCalled();
        expect(productRepo.save).toHaveBeenCalledWith([expect.objectContaining({ id: 1, stock: 2 })]);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe("OrderService.lockShopperCheckout", () => {
    // Two tabs paying at once: a row lock can't see a draft not yet
    // inserted, so each shopper's checkouts take turns on one key.
    it("takes a transaction-scoped lock keyed on the shopper", async () => {
        const manager = { query: vi.fn().mockResolvedValue([]) };
        const service = Object.create(OrderService.prototype) as any;

        await service.lockShopperCheckout(3, manager);

        expect(manager.query).toHaveBeenCalledWith("SELECT pg_advisory_xact_lock(hashtext($1))", ["checkout:user:3"]);
    });
});

describe("starting eSewa on a draft that already ended", () => {
    it("refuses with a code the checkout can act on", async () => {
        const service = Object.create(OrderService.prototype) as any;
        service.checkoutDraftRepository = { update: vi.fn().mockResolvedValue({ affected: 0 }) };

        await expect(service.initateEsewaPaymentForDraft({ id: 5, totals: { totalPrice: 100 } })).rejects.toMatchObject({
            status: 410,
            errorCode: "CHECKOUT_ENDED",
        });
    });
});
