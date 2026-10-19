// export interface ICartAddRequest {
//     productId: number;
//     quantity: number;
// }

export interface ICartRemoveRequest {
    cartItemId: number;
    decreaseOnly?: boolean;
}

export interface ICartAddRequest {
    productId: number;
    variantId?: number; 
    quantity: number;
    /** "buy_now" skips the cart, and so skips its notification. */
    source?: "add_to_cart" | "buy_now";
}
