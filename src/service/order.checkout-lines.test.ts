import { describe, expect, it, vi } from "vitest";

vi.mock("../search/catalog-visibility", () => ({ hiddenProductIds: vi.fn().mockResolvedValue([]) }));

import { OrderService } from "./order.service";

/**
 * Two shoppers hold the same stock in their carts; whoever orders first gets
 * it. The other one's checkout must say exactly what changed — never drop a
 * line they were shown, never charge for one that can't ship.
 */
const service = Object.create(OrderService.prototype) as any;

const product = (id: number, stock: number) => ({ id, name: `P${id}`, stock, status: "AVAILABLE", hasVariants: false });
const line = (id: number, quantity: number, stock: number) => ({ id, quantity, product: product(id, stock), variant: null });

describe("OrderService.linesToOrder", () => {
    service.heldByShopper = vi.fn().mockResolvedValue(new Map());

    const cart = [line(1, 1, 5), line(2, 8, 5), line(3, 1, 0)];

    it("orders only the lines the shopper was shown as included", async () => {
        const lines = await service.linesToOrder(cart, [{ id: 1, quantity: 1 }]);
        expect(lines.map((l: any) => l.id)).toEqual([1]);
    });

    it("refuses with the changed lines when an included line ran short meanwhile", async () => {
        const raced = [line(1, 1, 0), line(2, 8, 5)];
        await expect(service.linesToOrder(raced, [{ id: 1, quantity: 1 }])).rejects.toMatchObject({
            status: 409,
            errorCode: "INSUFFICIENT_STOCK",
            details: { items: [expect.objectContaining({ cartItemId: 1, reason: "SOLD_OUT" })] },
        });
    });

    it("refuses when the cart changed elsewhere since the page loaded", async () => {
        await expect(
            service.linesToOrder([line(1, 2, 5)], [{ id: 1, quantity: 1 }]),
        ).rejects.toMatchObject({ status: 409, errorCode: "CHECKOUT_CHANGED" });
        await expect(
            service.linesToOrder([line(1, 1, 5), line(4, 1, 5)], [{ id: 1, quantity: 1 }]),
        ).rejects.toMatchObject({ errorCode: "CHECKOUT_CHANGED" });
    });

    it("refuses an order with nothing left to buy", async () => {
        await expect(service.linesToOrder([line(3, 1, 0)], [])).rejects.toMatchObject({
            status: 400,
            errorCode: "NOTHING_TO_ORDER",
        });
    });

    it("keeps the strict rule for a client that sends no lines: any problem stops the order", async () => {
        await expect(service.linesToOrder(cart)).rejects.toMatchObject({
            errorCode: "INSUFFICIENT_STOCK",
            details: { items: [expect.objectContaining({ cartItemId: 2 }), expect.objectContaining({ cartItemId: 3 })] },
        });
        expect(await service.linesToOrder([line(1, 1, 5)])).toHaveLength(1);
    });
});

describe("OrderService.linesToOrder with the shopper's own hold", () => {
    it("lets a shopper buy the unit their unpaid online checkout holds", async () => {
        const own = Object.create(OrderService.prototype) as any;
        own.heldByShopper = vi.fn().mockResolvedValue(new Map([["p:1", 1]]));

        const lines = await own.linesToOrder([line(1, 1, 0)], [{ id: 1, quantity: 1 }], 3);

        expect(own.heldByShopper).toHaveBeenCalledWith(3);
        expect(lines.map((l: any) => l.id)).toEqual([1]);
    });
});

describe("OrderService checkout line items", () => {
    // A Buy Now checkout has no cart to draw its one line from.
    it("carry what a checkout needs to show the line on its own", () => {
        const svc = Object.create(OrderService.prototype) as any;
        const breakdown = svc.buildCheckoutPriceBreakdown([
            {
                id: 4,
                quantity: 2,
                product: {
                    id: 1, name: "Tee", vendorId: 9, vendor: { businessName: "Store" }, basePrice: 800, finalPrice: 800,
                    discountAmount: 0, productImages: ["p.jpg"], stock: 7,
                },
                variant: { id: 3, basePrice: 800, finalPrice: 800, discountAmount: 0, variantImages: ["v.jpg"], stock: 2, attributes: { Size: "M" } },
            },
        ]);
        expect(breakdown.lineItems[0]).toMatchObject({
            cartItemId: 4,
            image: "v.jpg",
            vendorName: "Store",
            attributes: { Size: "M" },
            stock: 2,
        });
    });
});
