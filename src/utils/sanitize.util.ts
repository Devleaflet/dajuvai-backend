import { User, UserRole } from "../entities/user.entity";
import { Vendor } from "../entities/vendor.entity";
import {
    Order,
    OrderStatus,
    DeliveryStatus,
    PaymentStatus,
    PaymentMethod,
} from "../entities/order.entity";
import { OrderItem } from "../entities/orderItems.entity";
import { Address } from "../entities/address.entity";
import { PaymentOption } from "../entities/vendorPaymentOption";
import { DiscountType } from "../entities/product.enum";
import { PromoType } from "../entities/promo.entity";

export interface SanitizedVendor {
    id: number;
    businessName: string;
    email: string;
    phoneNumber: string;
    telePhone: string | null;
    profilePicture: string | null;
    districtId: number;
    district: { id: number; name: string } | null;
    paymentOptions: {
        id: number;
        paymentType: PaymentOption;
        details: Record<string, any>;
        qrCodeImage: string | null;
        isActive: boolean;
    }[];
}

export const sanitizeVendor = (vendor: Vendor): SanitizedVendor => ({
    id: vendor.id,
    businessName: vendor.businessName,
    email: vendor.email,
    phoneNumber: vendor.phoneNumber,
    telePhone: vendor.telePhone ?? null,
    profilePicture: vendor.profilePicture ?? null,
    districtId: vendor.districtId,
    district: vendor.district
        ? { id: vendor.district.id, name: vendor.district.name }
        : null,
    paymentOptions: (vendor.paymentOptions ?? []).map((po) => ({
        id: po.id,
        paymentType: po.paymentType,
        details: po.details,
        qrCodeImage: po.qrCodeImage,
        isActive: po.isActive,
    })),
});

export interface SanitizedVendorForAdmin {
    id: number;
    businessName: string;
    email: string;
    phoneNumber: string;
    telePhone: string | null;
    profilePicture: string | null;
    districtId: number;
    district: { id: number; name: string } | null;
    paymentOptions: {
        id: number;
        paymentType: PaymentOption;
        details: Record<string, any>;
        qrCodeImage: string | null;
        isActive: boolean;
    }[];
    isApproved: boolean;
    taxDocuments: string[];
    isVerified: boolean;
    businessRegNumber: string;
    taxNumber: string;
    citizenshipDocuments: string[];
    createdAt: Date;
}

export const sanitizeVendorForAdmin = (
    vendor: Vendor,
): SanitizedVendorForAdmin => ({
    id: vendor.id,
    businessName: vendor.businessName,
    email: vendor.email,
    phoneNumber: vendor.phoneNumber,
    telePhone: vendor.telePhone ?? null,
    profilePicture: vendor.profilePicture ?? null,
    districtId: vendor.districtId,
    district: vendor.district
        ? { id: vendor.district.id, name: vendor.district.name }
        : null,
    paymentOptions: (vendor.paymentOptions ?? []).map((po) => ({
        id: po.id,
        paymentType: po.paymentType,
        details: po.details,
        qrCodeImage: po.qrCodeImage,
        isActive: po.isActive,
    })),
    isApproved: vendor.isApproved,
    taxDocuments: vendor.taxDocuments,
    isVerified: vendor.isVerified,
    businessRegNumber: vendor.businessRegNumber,
    taxNumber: vendor.taxNumber,
    citizenshipDocuments: vendor.citizenshipDocuments,
    // Missing here meant the admin panel's vendor-join-date range filter
    // always received `undefined`, making every comparison an Invalid Date
    // (always false) — the filter silently excluded every vendor instead of
    // matching the ones actually in range.
    createdAt: vendor.createdAt,
});

export interface SanitizedUser {
    id: number;
    fullName: string;
    name: string;
    username?: string;
    email: string;
    phoneNumber: string;
    phone: string;
    role: UserRole;
    isVerified: boolean;
    profilePicture?: string;
    // Needed by the frontend to adapt auth flows (e.g. Google accounts have
    // no password, so the delete-account modal must not ask for one).
    provider?: string;
    address: {
        id: number;
        city: string;
        province: string;
        district: string;
        landmark: string;
        localAddress: string;
    } | null;
}

export const sanitizeUser = (user: User): SanitizedUser => {
    const fullName = user.fullName || user.username || "Unknown Customer";
    return {
        id: user.id,
        fullName: user.fullName,
        name: fullName,
        username: user.username || undefined,
        phoneNumber: user.phoneNumber,
        phone: user.phoneNumber || "",
        email: user.email,
        role: user.role,
        isVerified: user.isVerified,
        profilePicture: user.profilePicture || undefined,
        provider: user.provider,

        address: user.address
            ? {
                  id: user.address.id,
                  city: user.address.city,
                  province: user.address.province,
                  district: user.address.district,
                  landmark: user.address.landmark,
                  localAddress: user.address.localAddress,
              }
            : null,
    };
};

export const sanitizeAdmin = (user: User) => {
    return {
        id: user.id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        phoneNumber: user.phoneNumber,
        role: user.role,
        isVerified: user.isVerified,
        profilePicture: user.profilePicture,
    };
};

export interface SanitizedOrderItem {
    id: number;
    productId: number;
    quantity: number;
    price: number;
    variantId: number | null;
    collectedAtWarehouse: boolean;
    productNameSnapshot?: string | null;
    skuSnapshot?: string | null;
    imageSnapshot?: string | null;
    unitPriceSnapshot?: number | null;
    priceBreakdown: {
        basePrice: number;
        unitPrice: number;
        lineBaseTotal: number;
        lineTotal: number;
        productDiscount: {
            label: string | null;
            type: string | null;
            amount: number;
        };
        dealDiscount: {
            label: string | null;
            percent: number | null;
            amount: number;
        };
        savingsTotal: number;
    };
    product: {
        id: number;
        name: string;
        productImages: string[];
        finalPrice: number | null;
        basePrice: number | null;
        description: string;
        subcategoryId: number;
        vendorId: number;
    } | null;
    variant: {
        id: number;
        sku: string;
        attributes: any;
        finalPrice: number | null;
        productId: number;
        basePrice: number | null;
        variantImages: string[];
    } | null;
    vendorId: number;
    vendor: SanitizedVendor;
}

const toNumber = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const buildOrderItemPriceBreakdown = (item: OrderItem) => {
    const unitPrice = toNumber(item.unitPriceSnapshot ?? item.price);
    const basePrice = toNumber(
        item.basePriceSnapshot ??
            item.variant?.basePrice ??
            item.product?.basePrice ??
            unitPrice,
        unitPrice,
    );
    const quantity = toNumber(item.quantity);
    const discountType = item.discountTypeSnapshot ?? null;
    const productDiscount = toNumber(
        item.productDiscountSnapshot ??
            (discountType && discountType !== DiscountType.NONE
                ? Math.max(0, basePrice - unitPrice)
                : 0),
    );
    const dealDiscount = toNumber(item.dealDiscountSnapshot ?? 0);
    const savings = productDiscount + dealDiscount;

    return {
        basePrice,
        unitPrice,
        lineBaseTotal: basePrice * quantity,
        lineTotal: unitPrice * quantity,
        productDiscount: {
            label: item.discountLabelSnapshot ?? null,
            type: discountType,
            amount: productDiscount * quantity,
        },
        dealDiscount: {
            label: item.dealNameSnapshot ?? null,
            percent: item.dealPercentSnapshot
                ? toNumber(item.dealPercentSnapshot)
                : null,
            amount: dealDiscount * quantity,
        },
        savingsTotal: savings * quantity,
    };
};

export const sanitizeOrderItem = (item: OrderItem): SanitizedOrderItem => {
    const priceBreakdown = buildOrderItemPriceBreakdown(item);

    return {
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        variantId: item.variantId ?? null,
        collectedAtWarehouse: item.collectedAtWarehouse,
        productNameSnapshot: item.productNameSnapshot ?? null,
        skuSnapshot: item.skuSnapshot ?? null,
        imageSnapshot: item.imageSnapshot ?? null,
        unitPriceSnapshot: item.unitPriceSnapshot ?? null,
        priceBreakdown,
        product: item.product
            ? {
                  id: item.product.id,
                  name: item.product.name,
                  productImages: item.product.productImages ?? [],
                  finalPrice: item.product.finalPrice ?? null,
                  basePrice: item.product.basePrice ?? null,
                  description: item.product.description,
                  subcategoryId: item.product.subcategoryId,
                  vendorId: item.product.vendorId,
              }
            : null,
        variant: item.variant
            ? {
                  id: item.variant.id,
                  productId: item.productId,
                  sku: item.variant.sku,
                  attributes: item.variant.attributes,
                  finalPrice: item.variant.finalPrice ?? null,
                  basePrice: item.variant.basePrice ?? null,
                  variantImages: item.variant.variantImages ?? [],
              }
            : null,
        vendorId: item.vendorId ?? item.product?.vendorId,
        vendor: item.vendor ? sanitizeVendor(item.vendor) : null,
    };
};

export interface SanitizedVendorShipping {
    vendorId: number;
    vendorName: string;
    vendorDistrict: string;
    customerDistrict: string;
    shippingZone: string;
    shippingFee: number;
    subtotal: number;
    itemCount: number;
    vendorTotal: number;
}

export interface SanitizedOrderFull {
    id: number;
    orderNumber: string;
    totalPrice: number;
    shippingFee: number;
    merchandiseSubtotal: number;
    discountTotal: number;
    taxTotal: number;
    serviceCharge: number;
    status: OrderStatus;
    deliveryStatus: DeliveryStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    appliedPromoCode: string | null;
    promoApplyOn: PromoType | null;
    phoneNumber: string | null;
    isBuyNow: boolean;
    createdAt: Date;
    updatedAt: Date;
    orderedBy: SanitizedUser | null;
    shippingAddress: Address | null;
    orderItems: SanitizedOrderItem[];
    priceBreakdown: {
        actualPrice: number;
        merchandiseSubtotal: number;
        productDiscountTotal: number;
        dealDiscountTotal: number;
        promoDiscountTotal: number;
        promoApplyOn: PromoType | null;
        promoLineTotalDiscount: number;
        promoShippingDiscount: number;
        appliedPromoCode: string | null;
        lineItems: SanitizedOrderItem["priceBreakdown"][];
    };
    vendorShippingBreakdown: SanitizedVendorShipping[];
}

/**
 * Builds the per-vendor shipping breakdown strictly from the immutable
 * `OrderVendorShipping` rows persisted at checkout — never recomputed from
 * the (possibly since-changed) live vendor/customer district data. Requires
 * the `vendorShippings` relation to be loaded on `order`.
 */
function buildVendorShippingBreakdown(order: Order): SanitizedVendorShipping[] {
    const itemsByVendor = new Map<
        number,
        { subtotal: number; itemCount: number }
    >();
    for (const item of order.orderItems ?? []) {
        const existing = itemsByVendor.get(item.vendorId) ?? {
            subtotal: 0,
            itemCount: 0,
        };
        existing.subtotal += Number(item.price) * item.quantity;
        existing.itemCount += item.quantity;
        itemsByVendor.set(item.vendorId, existing);
    }

    return (order.vendorShippings ?? []).map((vs) => {
        const items = itemsByVendor.get(vs.vendorId) ?? {
            subtotal: 0,
            itemCount: 0,
        };
        return {
            vendorId: vs.vendorId,
            vendorName: vs.vendorNameSnapshot || `Vendor #${vs.vendorId}`,
            vendorDistrict: vs.vendorDistrictSnapshot || "",
            customerDistrict: vs.customerDistrictSnapshot || "",
            shippingZone: vs.shippingZone,
            shippingFee: Number(vs.shippingFee),
            subtotal: items.subtotal,
            itemCount: items.itemCount,
            vendorTotal: Number(vs.vendorTotal),
        };
    });
}

export const sanitizeOrderFull = (order: Order): SanitizedOrderFull => {
    const orderItems = (order.orderItems ?? []).map(sanitizeOrderItem);
    const lineBreakdowns = orderItems.map((item) => item.priceBreakdown);

    // The order stores the promo discount as one flat amount; classify it
    // by the persisted applyOn so LINE_TOTAL vs SHIPPING promos can be shown
    // separately in admin/user views (shipping promos never touch vendor
    // merchandise payments).
    const promoApplyOn = order.promoApplyOn ?? null;
    const promoDiscountTotal = Number(order.discountTotal) || 0;
    const promoLineTotalDiscount =
        promoApplyOn === PromoType.SHIPPING ? 0 : promoDiscountTotal;
    const promoShippingDiscount =
        promoApplyOn === PromoType.SHIPPING ? promoDiscountTotal : 0;

    return {
        id: order.id,
        orderNumber: order.orderNumber,
        totalPrice: order.totalPrice,
        shippingFee: order.shippingFee,
        merchandiseSubtotal: order.merchandiseSubtotal,
        discountTotal: order.discountTotal,
        taxTotal: order.taxTotal,
        serviceCharge: order.serviceCharge,
        status: order.status,
        deliveryStatus: order.deliveryStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        appliedPromoCode: order.appliedPromoCode ?? null,
        promoApplyOn,
        phoneNumber: order.phoneNumber ?? null,
        isBuyNow: order.isBuyNow ?? false,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        orderedBy: order.orderedBy ? sanitizeUser(order.orderedBy) : null,
        shippingAddress: order.shippingAddress ?? null,
        orderItems,
        priceBreakdown: {
            actualPrice: lineBreakdowns.reduce(
                (sum, line) => sum + line.lineBaseTotal,
                0,
            ),
            merchandiseSubtotal: lineBreakdowns.reduce(
                (sum, line) => sum + line.lineTotal,
                0,
            ),
            productDiscountTotal: lineBreakdowns.reduce(
                (sum, line) => sum + line.productDiscount.amount,
                0,
            ),
            dealDiscountTotal: lineBreakdowns.reduce(
                (sum, line) => sum + line.dealDiscount.amount,
                0,
            ),
            promoDiscountTotal,
            promoApplyOn,
            promoLineTotalDiscount,
            promoShippingDiscount,
            appliedPromoCode: order.appliedPromoCode ?? null,
            lineItems: lineBreakdowns,
        },
        vendorShippingBreakdown: buildVendorShippingBreakdown(order),
    };
};

export interface SanitizedVendorOrderView {
    id: number;
    orderNumber: string;
    status: OrderStatus;
    deliveryStatus: DeliveryStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    createdAt: Date;
    orderedBy: SanitizedUser | null;
    // The customer's delivery address — every vendor on the order needs
    // this for fulfillment; it is not the sensitive part (other vendors'
    // shipping fees and the order grand total are what stay hidden).
    shippingAddress: Address | null;
    orderItems: SanitizedOrderItem[];
    itemsSubtotal: number;
    discountAllocation: number;
    appliedPromoCode: string | null;
    promoApplyOn: PromoType | null;
    vendorPayable: number;
    /** Only present so a vendor responsible for fulfillment can see the fee
     * for its own shipment — never the order's other-vendor fees or total. */
    ownShippingFee: number | null;
    ownShippingZone: string | null;
}

/**
 * Vendor-facing order view: scoped to a single vendor's own items only.
 * Deliberately omits the order's grand total, other vendors' items, and the
 * cross-vendor shipping breakdown — a vendor must never see another
 * vendor's shipping or settlement information.
 */
export const sanitizeOrderForVendor = (
    order: Order,
    vendorId: number,
): SanitizedVendorOrderView => {
    const vendorItems = (order.orderItems ?? []).filter(
        (i) => i.vendorId === vendorId,
    );
    const itemsSubtotal = vendorItems.reduce(
        (sum, item) => sum + Number(item.price) * item.quantity,
        0,
    );

    const orderMerchandiseSubtotal = Number(order.merchandiseSubtotal) || 0;
    // A SHIPPING promo discounts the customer's shipping fee, never the
    // merchandise — so it must not be allocated against a vendor's items
    // (vendors never see the order's shipping at all).
    const promoApplyOn = order.promoApplyOn ?? null;
    const allocatableDiscount =
        promoApplyOn === PromoType.SHIPPING
            ? 0
            : Number(order.discountTotal || 0);
    const discountAllocation =
        orderMerchandiseSubtotal > 0
            ? allocatableDiscount * (itemsSubtotal / orderMerchandiseSubtotal)
            : 0;

    const ownShipping = (order.vendorShippings ?? []).find(
        (vs) => vs.vendorId === vendorId,
    );

    return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        deliveryStatus: order.deliveryStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        orderedBy: order.orderedBy ? sanitizeUser(order.orderedBy) : null,
        shippingAddress: order.shippingAddress ?? null,
        orderItems: vendorItems.map(sanitizeOrderItem),
        itemsSubtotal,
        discountAllocation: Number(discountAllocation.toFixed(2)),
        appliedPromoCode: order.appliedPromoCode ?? null,
        promoApplyOn,
        vendorPayable: Number((itemsSubtotal - discountAllocation).toFixed(2)),
        ownShippingFee: ownShipping ? Number(ownShipping.shippingFee) : null,
        ownShippingZone: ownShipping?.shippingZone ?? null,
    };
};
