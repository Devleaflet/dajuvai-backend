import { z } from 'zod';

/**
 * Schema to validate adding a product to the wishlist.
 * Requires a positive integer productId.
 */
export const addToWishlistSchema = z.object({
    productId: z.number().int().positive('Product ID must be a positive integer'),
});

/**
 * Schema to validate removing an item from the wishlist.
 * Requires a positive integer wishlistItemId.
 */
export const removeFromWishlistSchema = z.object({
    wishlistItemId: z.number().int().positive('Wishlist item ID must be a positive integer'),
});

/**
 * Schema to validate moving a wishlist item to the cart.
 * Requires a positive integer wishlistItemId and quantity.
 */
export const moveToCartSchema = z.object({
    wishlistItemId: z.number().int().positive('Wishlist item ID must be a positive integer'),
    quantity: z.number().int().positive('Quantity must be a positive integer'),
});

// TypeScript types inferred from the schemas
export type AddToWishlistInput = z.infer<typeof addToWishlistSchema>;
export type RemoveFromWishlistInput = z.infer<typeof removeFromWishlistSchema>;
export type MoveToCartInput = z.infer<typeof moveToCartSchema>;
