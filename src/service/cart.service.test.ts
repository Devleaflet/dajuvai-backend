import { beforeEach, describe, expect, it, vi } from "vitest";
import { CartService } from "./cart.service";
import { addToCartSchema } from "../utils/zod_validations/cart.zod";

const { notifyAddToCart } = vi.hoisted(() => ({
    notifyAddToCart: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./notification.service", () => ({
    NotificationService: class {
        notifyAddToCart = notifyAddToCart;
    },
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
        create: vi.fn((data) => ({ id: 9, ...data })),
        save: vi.fn(async (item) => item),
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
    };
    service.cartItemRepository = cartItemRepository;

    return { service, cart, cartItemRepository };
};

describe("CartService.addToCart notification source", () => {
    beforeEach(() => {
        notifyAddToCart.mockClear();
    });

    it("creates cart item without sending push for Buy Now", async () => {
        const { service, cart, cartItemRepository } = makeCartService();

        await service.addToCart(7, {
            productId: 123,
            quantity: 1,
            source: "buy_now",
        });

        expect(cartItemRepository.create).toHaveBeenCalledOnce();
        expect(cart.items).toHaveLength(1);
        expect(notifyAddToCart).not.toHaveBeenCalled();
    });

    it("sends push for an explicit Add to Cart source", async () => {
        const { service } = makeCartService();

        await service.addToCart(7, {
            productId: 123,
            quantity: 1,
            source: "add_to_cart",
        });

        expect(notifyAddToCart).toHaveBeenCalledOnce();
    });

    it("sends push when source is missing for backward compatibility", async () => {
        const { service } = makeCartService();

        await service.addToCart(7, {
            productId: 123,
            quantity: 1,
        });

        expect(notifyAddToCart).toHaveBeenCalledOnce();
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
