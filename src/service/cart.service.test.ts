import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartService } from "./cart.service";
import { addToCartSchema } from "../utils/zod_validations/cart.zod";

// Adding to the cart must never notify: the shopper is in the app already.
const { notificationServiceCreated } = vi.hoisted(() => ({ notificationServiceCreated: vi.fn() }));

vi.mock("./notification.service", () => ({
    NotificationService: class {
        constructor() {
            notificationServiceCreated();
        }
    },
}));

const { hiddenProductIds } = vi.hoisted(() => ({
    hiddenProductIds: vi.fn().mockResolvedValue([] as number[]),
}));

vi.mock("../search/catalog-visibility", () => ({ hiddenProductIds }));

const { stockHeldBy } = vi.hoisted(() => ({ stockHeldBy: vi.fn().mockResolvedValue(new Map()) }));
vi.mock("../utils/stockAvailability", async (importOriginal) => ({
    ...(await importOriginal<typeof import("../utils/stockAvailability")>()),
    stockHeldBy,
}));

const makeCartService = () => {
    const product = {
        id: 123,
        name: "Test Product",
        description: "",
        productImages: [],
        hasVariants: false,
        basePrice: 100,
        finalPrice: 100,
        discountAmount: 0,
        stock: 10,
    };
    const cart = { id: 1, userId: 7, total: 0, items: [] as any[] };
    const cartItemRepository = {
        findOne: vi.fn(async () => null),
        insert: vi.fn(async (data) => {
            cart.items.push({ id: 9, product, ...data });
        }),
        update: vi.fn(async () => undefined),
    };

    const service = Object.create(CartService.prototype) as any;
    service.productRepository = {
        findOne: vi.fn(async () => product),
    };
    service.variantRepository = {
        findOne: vi.fn(async () => null),
    };
    service.cartRepository = {
        findOne: vi.fn(async () => cart),
        save: vi.fn(async (value) => value),
        update: vi.fn(async () => undefined),
    };
    service.cartItemRepository = cartItemRepository;

    return { service, cart, cartItemRepository };
};

describe("CartService.addToCart notification source", () => {
    beforeEach(() => {
        notificationServiceCreated.mockClear();
    });

    it("creates the cart item for Buy Now without notifying", async () => {
        const { service, cart, cartItemRepository } = makeCartService();

        await service.addToCart(7, {
            productId: 123,
            quantity: 1,
            source: "buy_now",
        });

        expect(cartItemRepository.insert).toHaveBeenCalledOnce();
        expect(cart.items).toHaveLength(1);
        expect(notificationServiceCreated).not.toHaveBeenCalled();
    });

    it("does not push for Add to Cart, with or without a source", async () => {
        const { service } = makeCartService();

        await service.addToCart(7, { productId: 123, quantity: 1, source: "add_to_cart" });
        await service.addToCart(7, { productId: 123, quantity: 1 });

        expect(notificationServiceCreated).not.toHaveBeenCalled();
    });

    it("refuses a product the public catalogue no longer shows", async () => {
        const { service, cartItemRepository } = makeCartService();
        hiddenProductIds.mockResolvedValueOnce([123]);

        await expect(service.addToCart(7, { productId: 123, quantity: 1 })).rejects.toMatchObject({
            status: 404,
        });
        expect(cartItemRepository.insert).not.toHaveBeenCalled();
    });
});

describe("addToCartSchema source", () => {
    it("accepts and preserves supported source values", () => {
        expect(
            addToCartSchema.parse({
                productId: 123,
                quantity: 1,
                source: "buy_now",
            }),
        ).toEqual({
            productId: 123,
            quantity: 1,
            source: "buy_now",
        });
    });
});

describe("CartService.getCart stock flags", () => {
    const withLines = (items: any[]) => {
        const { service } = makeCartService();
        service.cartRepository.findOne = vi.fn(async () => ({ id: 1, userId: 7, total: 0, items }));
        service.cartItemRepository.update = vi.fn(async () => undefined);
        return service;
    };
    const product = (overrides: Record<string, unknown> = {}) => ({
        id: 5, name: "Mug", hasVariants: false, basePrice: 500, finalPrice: 500, discountAmount: 0,
        stock: 10, status: "AVAILABLE", ...overrides,
    });

    it("flags each line with the same verdict checkout will reach", async () => {
        const cart = await withLines([
            { id: 1, quantity: 8, price: 500, product: product({ stock: 5 }), variant: null },
            { id: 2, quantity: 1, price: 500, product: product({ id: 6, name: "Lamp", stock: 0, status: "OUT_OF_STOCK" }), variant: null },
            { id: 3, quantity: 2, price: 500, product: product({ id: 7, name: "Cup" }), variant: null },
        ]).getCart(7);

        const [low, gone, fine] = cart.items as any[];
        expect(low.stockIssue).toMatchObject({ reason: "LOW_STOCK", available: 5, requested: 8 });
        expect(low.warningMessage).toBe("Only 5 left — you have 8 in your cart.");
        expect(gone.stockIssue).toMatchObject({ reason: "SOLD_OUT", available: 0 });
        expect(gone.warningMessage).toBe("Sold out.");
        expect(fine.stockIssue).toBeNull();
        expect(fine.warningMessage).toBeUndefined();
    });
});

describe("CartService.getCart and the shopper's own hold", () => {
    it("does not call a unit the shopper's unpaid checkout holds sold out", async () => {
        const { service } = makeCartService();
        service.cartRepository.findOne = vi.fn(async () => ({
            id: 1, userId: 7, total: 0,
            items: [{ id: 1, quantity: 1, price: 500, variant: null, product: {
                id: 5, name: "Lamp", hasVariants: false, basePrice: 500, finalPrice: 500, discountAmount: 0, stock: 0, status: "OUT_OF_STOCK",
            } }],
        }));
        stockHeldBy.mockResolvedValueOnce(new Map([["p:5", 1]]));

        const cart = await service.getCart(7);

        expect(stockHeldBy).toHaveBeenCalledWith(expect.anything(), 7);
        expect((cart.items as any[])[0].stockIssue).toBeNull();
    });
});
