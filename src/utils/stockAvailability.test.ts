import { describe, expect, it } from "vitest";

import { holdKey, lineStockIssue, stockIssueError } from "./stockAvailability";

const product = (overrides: Record<string, unknown> = {}) => ({
    id: 1,
    name: "Lamp",
    stock: 10,
    status: "AVAILABLE",
    hasVariants: false,
    ...overrides,
});

const line = (overrides: Record<string, unknown> = {}) =>
    ({ id: 7, quantity: 2, product: product(), variant: null, ...overrides }) as never;

describe("lineStockIssue", () => {
    it("passes a line the shelf can fill", () => {
        expect(lineStockIssue(line())).toBeNull();
        expect(lineStockIssue(line({ quantity: 10 }))).toBeNull();
    });

    it("reports fewer left than asked as LOW_STOCK, with what is left", () => {
        expect(lineStockIssue(line({ quantity: 8, product: product({ stock: 5 }) }))).toEqual({
            cartItemId: 7,
            productId: 1,
            variantId: null,
            name: "Lamp",
            requested: 8,
            available: 5,
            reason: "LOW_STOCK",
        });
    });

    it("reports nothing left as SOLD_OUT, whatever the status says", () => {
        expect(lineStockIssue(line({ product: product({ stock: 0 }) }))?.reason).toBe("SOLD_OUT");
        expect(lineStockIssue(line({ product: product({ status: "OUT_OF_STOCK" }) }))?.reason).toBe("SOLD_OUT");
    });

    it("reads a variant line's own stock and names the option", () => {
        const issue = lineStockIssue(
            line({
                quantity: 2,
                product: product({ hasVariants: true, stock: 99 }),
                variant: { id: 4, stock: 1, status: "LOW_STOCK", sku: "TEE-M", attributes: { Size: "M" } },
            }),
        );
        expect(issue).toMatchObject({ variantId: 4, name: "Lamp (Size: M)", available: 1, reason: "LOW_STOCK" });
    });

    it("treats a missing product, a missing option or a hidden product as UNAVAILABLE", () => {
        expect(lineStockIssue(line({ product: null }))?.reason).toBe("UNAVAILABLE");
        expect(lineStockIssue(line({ product: product({ hasVariants: true }) }))?.reason).toBe("UNAVAILABLE");
        expect(lineStockIssue(line(), new Set([1]))?.reason).toBe("UNAVAILABLE");
        // The option this line was for has been deleted.
        expect(lineStockIssue(line({ variantId: 4, variant: null }))?.reason).toBe("UNAVAILABLE");
    });
});

describe("lineStockIssue with the shopper's own hold", () => {
    // Their unpaid online checkout took the last unit; it is still theirs.
    it("counts what this shopper holds as available to them", () => {
        const held = new Map([[holdKey(1, null), 1]]);
        expect(lineStockIssue(line({ quantity: 1, product: product({ stock: 0, status: "OUT_OF_STOCK" }) }), undefined, held)).toBeNull();
        expect(lineStockIssue(line({ quantity: 3, product: product({ stock: 1 }) }), undefined, held)).toMatchObject({
            reason: "LOW_STOCK",
            available: 2,
        });
    });

    it("keys a variant hold by the variant", () => {
        const held = new Map([[holdKey(1, 4), 2]]);
        const tee = line({ quantity: 2, product: product({ hasVariants: true }), variant: { id: 4, stock: 0, status: "OUT_OF_STOCK" } });
        expect(lineStockIssue(tee, undefined, held)).toBeNull();
    });
});

describe("stockIssueError", () => {
    const issue = (reason: string, overrides: Record<string, unknown> = {}) =>
        ({ cartItemId: 7, productId: 1, variantId: null, name: "Lamp", requested: 8, available: 5, reason, ...overrides }) as never;

    it("is a 409 the client can act on, carrying the lines", () => {
        const error = stockIssueError([issue("LOW_STOCK")]);
        expect(error.status).toBe(409);
        expect(error.errorCode).toBe("INSUFFICIENT_STOCK");
        expect(error.details).toEqual({ items: [issue("LOW_STOCK")] });
    });

    it("says plainly what changed for one line", () => {
        expect(stockIssueError([issue("LOW_STOCK")]).message).toBe(
            'Only 5 of "Lamp" left — you asked for 8. Review your order, then place it again.',
        );
        expect(stockIssueError([issue("SOLD_OUT", { available: 0 })]).message).toBe(
            '"Lamp" just sold out. Review your order, then place it again.',
        );
        expect(stockIssueError([issue("UNAVAILABLE", { available: 0 })]).message).toBe(
            '"Lamp" is no longer available. Review your order, then place it again.',
        );
    });

    it("lists several lines in one sentence", () => {
        expect(
            stockIssueError([
                issue("SOLD_OUT", { available: 0 }),
                issue("LOW_STOCK", { name: "Mug", requested: 8, available: 5 }),
            ]).message,
        ).toBe('Some items just changed: "Lamp" sold out; only 5 of "Mug" left. Review your order, then place it again.');
    });
});
