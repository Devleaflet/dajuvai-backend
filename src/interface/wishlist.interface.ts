export interface IWishlistAddRequest {
    productId: number;
}

export interface IWishlistRemoveRequest {
    wishlistItemId: number;
}

export interface IWishlistMoveToCartRequest {
    wishlistItemId: number;
    quantity: number;
}