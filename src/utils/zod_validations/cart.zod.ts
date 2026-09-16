import { z } from 'zod';

export const addToCartSchema = z.object({
    // Product ID must be a positive integer
    productId: z.number().int().positive('Product ID must be a positive integer'),

    // Quantity must be a positive integer
    quantity: z.number().int().positive('Quantity must be a positive integer'),

    variantId: z.number().int().optional(),

    /**
     * How the item got here. "buy_now" goes straight to checkout and never
     * shows a cart, so telling the customer their item was added to one is
     * both wrong and a push they did not ask for.
     */
    source: z.enum(["add_to_cart", "buy_now"]).optional(),
});

export const removeFromCartSchema = z.object({
    // Cart item ID must be a positive integer
    cartItemId: z.number().int().positive('Cart item ID must be a positive integer'),
    decreaseOnly: z.boolean().optional(), 
});
