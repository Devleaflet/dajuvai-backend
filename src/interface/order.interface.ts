
import { Province } from '../entities/address.entity';
import { OrderStatus, PaymentMethod, PaymentStatus } from '../entities/order.entity';

export interface IShippingAddressRequest {
    province: Province;
    city: string;
    streetAddress: string;
    district: string;
    landmark: string;
}

export interface IOrderCreateRequest {
    shippingAddress: IShippingAddressRequest;
    paymentMethod: PaymentMethod;
    phoneNumber: string;
    serviceCharge?: number;
    instrumentName?: string;
    promoCode?: string;
    fullName?: string;
    idempotencyKey?: string;

    // buy now 
    isBuyNow?: boolean;   
    productId?: number;   
    variantId?: number;   
    quantity?: number;    
}

export interface IOrderItemResponse {
    id: number;
    productId: number;
    productName: string;
    quantity: number;
    price: number;
    vendorId: number;
    vendorName: string;
}

export interface IVendorOrderResponse {
    id: number;
    orderedById: number;
    customerName: string;
    createdAt: Date;
    totalPrice: number;
    shippingFee: number;
    paymentStatus: PaymentStatus;
    status: OrderStatus;
    shippingAddress: IShippingAddressRequest;
    orderItems: IOrderItemResponse[]; // Only items for the authenticated vendor
}

export interface IUpdateOrderStatusRequest {
    status: OrderStatus;
    expectedCurrentStatus?: OrderStatus;
    reason?: string;
    note?: string;
}

export interface IUpdateVendorOrderStatusRequest {
    status: import('../entities/orderVendorShipping.entity').VendorOrderStatus;
    reason?: string;
    note?: string;
}

export interface IOrderResponse {
    id: number;
    orderedById: number;
    customerName: string;
    totalPrice: number;
    shippingFee: number;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    status: OrderStatus;
    shippingAddress: IShippingAddressRequest;
    orderItems: IOrderItemResponse[];
    transactionId?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ISearchOrdersRequest {
    orderId?: string; // For searching by order ID
}

export type AdminOrderSort =
    | "newest"
    | "oldest"
    | "highest_total"
    | "lowest_total"
    | "recently_updated"
    | "order_number";

export interface IAdminOrderQueryParams {
    page?: number;
    limit?: number;
    search?: string;
    status?: OrderStatus;
    paymentStatus?: PaymentStatus;
    vendorId?: number;
    startDate?: string;
    endDate?: string;
    minPrice?: number;
    maxPrice?: number;
    sort?: AdminOrderSort;
}

export interface IPaginatedResult<T> {
    items: T[];
    pagination: {
        page: number;
        limit: number;
        totalItems: number;
        totalPages: number;
        hasNextPage: boolean;
        hasPreviousPage: boolean;
    };
}
