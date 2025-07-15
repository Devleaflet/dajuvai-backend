export interface ICartAddRequest {
    productId: number;
    quantity: number;
}

export interface ICartRemoveRequest {
    cartItemId: number;
    decreaseOnly?: boolean;
}