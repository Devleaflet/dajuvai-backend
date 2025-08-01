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
}
