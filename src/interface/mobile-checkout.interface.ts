import { PaymentMethod } from "../entities/order.entity";
import { IShippingAddressRequest } from "./order.interface";

export interface MobileCheckoutUser {
  id: number;
  fullName: string;
  username: string;
  email: string;
  phoneNumber: string;
  role: string;
  address: Record<string, unknown> | null;
}

export interface MobileCheckoutItem {
  id: number | null;
  productId: number | null;
  name: string;
  price: number;
  quantity: number;
  image: string | null;
  variantId: number | null;
  priceBreakdown: Record<string, unknown> | null;
  product: Record<string, unknown> | null;
  variant: Record<string, unknown> | null;
  vendor: Record<string, unknown> | null;
}

export interface MobileCheckoutEstimate extends Record<string, unknown> {
  merchandiseSubtotal: number;
  shippingTotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
}

export interface MobileCheckoutResponse {
  user: MobileCheckoutUser;
  cart: { id: number | null; total: number; items: MobileCheckoutItem[] };
  checkoutReady: boolean;
  missingCheckoutFields: string[];
  checkoutDefaults: {
    fullName: string;
    phoneNumber: string;
    shippingAddress: IShippingAddressRequest | null;
    paymentMethod: PaymentMethod;
  };
  availablePaymentMethods: PaymentMethod[];
  checkoutEstimate: MobileCheckoutEstimate | null;
  checkoutEstimateError: string | null;
  priceBreakdown: Record<string, unknown> | null;
  vendorShippingBreakdown: Array<Record<string, unknown>>;
  totals: Record<string, unknown> | null;
}
