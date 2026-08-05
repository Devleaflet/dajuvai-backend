import { PaymentMethod } from "../entities/order.entity";
import type {
  MobileCheckoutEstimate,
  MobileCheckoutItem,
  MobileCheckoutResponse,
} from "../interface/mobile-checkout.interface";

const finiteNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nullableId = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const nullableObject = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

const serializeItem = (item: Record<string, any>): MobileCheckoutItem => ({
  id: nullableId(item.id),
  productId: nullableId(item.productId),
  name: String(item.name ?? item.product?.name ?? ""),
  price: finiteNumber(item.price),
  quantity: Math.max(0, Math.floor(finiteNumber(item.quantity))),
  image: typeof item.image === "string" ? item.image : null,
  variantId: nullableId(item.variantId),
  priceBreakdown: nullableObject(item.priceBreakdown),
  product: nullableObject(item.product),
  variant: nullableObject(item.variant),
  vendor: nullableObject(item.vendor),
});

const serializeEstimate = (value: unknown): MobileCheckoutEstimate | null => {
  const estimate = nullableObject(value);
  if (!estimate) return null;
  return {
    ...estimate,
    merchandiseSubtotal: finiteNumber(estimate.merchandiseSubtotal),
    shippingTotal: finiteNumber(estimate.shippingTotal),
    discountTotal: finiteNumber(estimate.discountTotal),
    taxTotal: finiteNumber(estimate.taxTotal),
    grandTotal: finiteNumber(estimate.grandTotal),
  };
};

export function serializeMobileCheckout(input: any): MobileCheckoutResponse {
  const user = input.user ?? {};
  const defaults = input.checkoutDefaults ?? {};
  const rawCart = input.cart ?? {};
  const rawItems = Array.isArray(rawCart.items) ? rawCart.items : [];
  const availablePaymentMethods = Array.isArray(input.availablePaymentMethods)
    ? input.availablePaymentMethods.filter((method: unknown): method is PaymentMethod =>
        Object.values(PaymentMethod).includes(method as PaymentMethod),
      )
    : [];

  return {
    user: {
      id: nullableId(user.id) ?? 0,
      fullName: String(user.fullName ?? ""),
      username: String(user.username ?? ""),
      email: String(user.email ?? ""),
      phoneNumber: String(user.phoneNumber ?? ""),
      role: String(user.role ?? "user"),
      address: nullableObject(user.address),
    },
    cart: {
      id: nullableId(rawCart.id),
      total: finiteNumber(rawCart.total),
      items: rawItems.map((item: Record<string, any>) => serializeItem(item)),
    },
    checkoutReady: Boolean(input.checkoutReady),
    missingCheckoutFields: Array.isArray(input.missingCheckoutFields)
      ? input.missingCheckoutFields.map(String)
      : [],
    checkoutDefaults: {
      fullName: String(defaults.fullName ?? ""),
      phoneNumber: String(defaults.phoneNumber ?? ""),
      shippingAddress: defaults.shippingAddress ?? null,
      paymentMethod: Object.values(PaymentMethod).includes(defaults.paymentMethod)
        ? defaults.paymentMethod
        : PaymentMethod.CASH_ON_DELIVERY,
    },
    availablePaymentMethods,
    checkoutEstimate: serializeEstimate(input.checkoutEstimate),
    checkoutEstimateError:
      typeof input.checkoutEstimateError === "string"
        ? input.checkoutEstimateError
        : null,
    priceBreakdown: nullableObject(input.priceBreakdown),
    vendorShippingBreakdown: Array.isArray(input.vendorShippingBreakdown)
      ? input.vendorShippingBreakdown.map((line: unknown) => nullableObject(line) ?? {})
      : [],
    totals: nullableObject(input.totals),
  };
}
