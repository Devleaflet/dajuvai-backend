export interface IWishlistAddRequest {
    productId: number;
    variantId?: number;
}

export interface IWishlistRemoveRequest {
    wishlistItemId: number;
}

export interface IWishlistMoveToCartRequest {
    wishlistItemId: number;
    quantity: number;
    /** The option chosen now, for an item saved without one. */
    variantId?: number;
}

export interface IWishlistMoveManyToCartRequest {
    items: IWishlistMoveToCartRequest[];
}
