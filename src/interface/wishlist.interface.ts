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
}