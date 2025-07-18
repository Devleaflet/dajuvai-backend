// import { OrderStatus, PaymentMethod, PaymentStatus } from "../entities/order.entity";

// export interface IShippingAddressRequest {
//     province: string;
//     city: string;
//     streetAddress: string;
//     district: string
// }

// export interface IOrderCreateRequest {
//     shippingAddress: IShippingAddressRequest;
//     paymentMethod: PaymentMethod;
// }


// export interface IOrderItemResponse {
//     id: number;
//     productId: number;
//     productName: string;
//     quantity: number;
//     price: number;
//     vendorId: number;
//     vendorName: string;
// }

// export interface IVendorOrderResponse {
//     id: number;
//     orderedById: number;
//     customerName: string;
//     createdAt: Date;
//     totalPrice: number;
//     shippingFee: number;
//     paymentStatus: PaymentStatus;
//     status: OrderStatus;
//     shippingAddress: IShippingAddressRequest;
//     orderItems: IOrderItemResponse[]; // Only items for the authenticated vendor
// }

// export interface IUpdateOrderStatusRequest {
//     status: OrderStatus;
// }

import { Province } from '../entities/address.entity';
import { OrderStatus, PaymentMethod, PaymentStatus } from '../entities/order.entity';

export interface IShippingAddressRequest {
    province: Province;
    city: string;
    streetAddress: string;
    district: string; // Added district for shipping address
}

export interface IOrderCreateRequest {
    shippingAddress: IShippingAddressRequest;
    paymentMethod: PaymentMethod;
    phoneNumber: string;
    serviceCharge?: number;
    instrumentName?: string;
    promoCode?: string;
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