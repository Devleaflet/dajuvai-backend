import { User, UserRole } from "../entities/user.entity";
import { Vendor } from "../entities/vendor.entity";
import {
    Order,
    OrderStatus,
    DeliveryStatus,
    PaymentStatus,
    PaymentMethod,
} from "../entities/order.entity";
import { OrderItem, ItemFulfillmentStatus } from "../entities/orderItems.entity";
import { Address } from "../entities/address.entity";
import { PaymentOption } from "../entities/vendorPaymentOption";
import { DiscountType } from "../entities/product.enum";
import { PromoType } from "../entities/promo.entity";
import { computeCancelledAmount } from "./orderFulfillment.util";

export interface SanitizedVendor {
    id: number;
    slug: string;
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
    slug: vendor.slug,
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
    slug: string;
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
    /**
     * Requesting deletion sets `isApproved` to false, which drops the vendor
     * out of the approved list and into the unapproved one. Without these an
     * admin cannot tell a vendor on their way out from a new applicant waiting
     * to be let in — and approving the former does not call off the job that
     * finalises the deletion.
     */
    deletionRequestedAt: Date | null;
    deletionScheduledFor: Date | null;
}

export const sanitizeVendorForAdmin = (
    vendor: Vendor,
): SanitizedVendorForAdmin => ({
    id: vendor.id,
    slug: vendor.slug,
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
    deletionRequestedAt: vendor.deletionRequestedAt ?? null,
    deletionScheduledFor: vendor.deletionScheduledFor ?? null,
    // Missing here meant the admin panel's vendor-join-date range filter
    // always received `undefined`, making every comparison an Invalid Date
    // (always false) — the filter silently excluded every vendor instead of
    // matching the ones actually in range.
    createdAt: vendor.createdAt,
});

export interface SanitizedUser {
    id: number;
    slug: string;
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
        slug: user.slug,
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
        slug: user.slug,
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
    fulfillmentStatus: ItemFulfillmentStatus;
    cancellationRemark: string | null;
    confirmedAt: Date | null;
    cancelledAt: Date | null;
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
        slug: string;
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

const round2 = (value: number): number => Math.round(value * 100) / 100;

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

/**
 * The address this order ships to. A customer has one Address row, which each
 * checkout edits in place, so an older order's relation shows the newest
 * address; the per-order snapshot taken at checkout is the truth where present.
 */
export const orderShippingAddress = (
    order: Pick<Order, "shippingAddress" | "shippingAddressSnapshot">,
): Address | null => {
    const live = order.shippingAddress ?? null;
    const snapshot = order.shippingAddressSnapshot as Partial<Address> | null;
    if (!snapshot) return live;
    const sameDistrict = live && live.districtId === snapshot.districtId;
    return {
        ...(live ?? {}),
        ...snapshot,
        districtRef: sameDistrict ? live.districtRef : null,
    } as Address;
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
        fulfillmentStatus:
            item.fulfillmentStatus ?? ItemFulfillmentStatus.PENDING,
        cancellationRemark: item.cancellationRemark ?? null,
        confirmedAt: item.confirmedAt ?? null,
        cancelledAt: item.cancelledAt ?? null,
        productNameSnapshot: item.productNameSnapshot ?? null,
        skuSnapshot: item.skuSnapshot ?? null,
        imageSnapshot: item.imageSnapshot ?? null,
        unitPriceSnapshot: item.unitPriceSnapshot ?? null,
        priceBreakdown,
        product: item.product
            ? {
                  id: item.product.id,
                  slug: item.product.slug,
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
    // Cancelled-item deduction (spec §9.1): sum of the final payable line
    // values of CANCELLED items, always computed server-side from persisted
    // item pricing. finalTotal is what the customer ultimately pays (COD)
    // or retains after partial refund (prepaid).
    cancelledAmount: number;
    cancelledItemCount: number;
    finalTotal: number;
    status: OrderStatus;
    deliveryStatus: DeliveryStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    /** Gateway merchant transaction reference; null for cash orders. */
    mTransactionId: string | null;
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

/**
 * One order line as a *list* needs it, which is far less than a detail view.
 *
 * `sanitizeOrderFull` was serving both, so every row of the orders table
 * carried each line's price breakdown, its name/SKU/image snapshots and its
 * joined product and variant — about 1.5 KB per order, roughly half the row,
 * to render a count and a vendor name. At a hundred rows that is 425 KB, most
 * of it never read.
 *
 * Both consoles were checked before narrowing this: the Next admin table shows
 * the number of lines, and the React admin derives the distinct vendor names
 * and the total quantity. Those are exactly the fields kept.
 */
export interface SanitizedOrderListItem {
    id: number;
    quantity: number;
    vendorId: number | null;
    vendor: { id: number; slug: string; businessName: string | null } | null;
}

export const sanitizeOrderListItem = (
    item: OrderItem,
): SanitizedOrderListItem => ({
    id: item.id,
    quantity: item.quantity,
    vendorId: item.vendorId ?? null,
    vendor: item.vendor
        ? { id: item.vendor.id, slug: item.vendor.slug, businessName: item.vendor.businessName ?? null }
        : null,
});

/** An order as the admin list shows it: the full record minus each line's detail. */
export type SanitizedOrderListRow = Omit<SanitizedOrderFull, "orderItems"> & {
    orderItems: SanitizedOrderListItem[];
};

export const sanitizeOrderForList = (order: Order): SanitizedOrderListRow => ({
    ...sanitizeOrderFull(order),
    orderItems: (order.orderItems ?? []).map(sanitizeOrderListItem),
});

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

    // Cancelled-item impact, derived from the items themselves — never a
    // client-supplied value (spec §11).
    const rawItems = order.orderItems ?? [];
    const isCancelled = (item: OrderItem) =>
        (item.fulfillmentStatus ?? ItemFulfillmentStatus.PENDING) ===
        ItemFulfillmentStatus.CANCELLED;
    const cancelledItemCount = rawItems.filter(isCancelled).length;
    // A seller with nothing left to deliver charges no delivery: their fee
    // is cancelled with their last line. A cancelled order owes nothing.
    const sellerGone = (vendorId: number) => {
        const lines = rawItems.filter((item) => item.vendorId === vendorId);
        return lines.length > 0 && lines.every(isCancelled);
    };
    const allGone = rawItems.length > 0 && rawItems.every(isCancelled);
    const cancelledShipping = order.vendorShippings?.length
        ? order.vendorShippings
              .filter((vs) => sellerGone(vs.vendorId))
              .reduce((sum, vs) => sum + Number(vs.shippingFee || 0), 0)
        : allGone
          ? Number(order.shippingFee || 0)
          : 0;
    const cancelledAmount = round2(
        order.status === OrderStatus.CANCELLED
            ? Number(order.totalPrice) || 0
            : computeCancelledAmount(rawItems) + cancelledShipping,
    );
    const finalTotal = round2(
        Math.max(0, Number(order.totalPrice) - cancelledAmount),
    );

    return {
        id: order.id,
        orderNumber: order.orderNumber,
        totalPrice: order.totalPrice,
        shippingFee: order.shippingFee,
        merchandiseSubtotal: order.merchandiseSubtotal,
        discountTotal: order.discountTotal,
        taxTotal: order.taxTotal,
        serviceCharge: order.serviceCharge,
        cancelledAmount,
        cancelledItemCount,
        finalTotal,
        status: order.status,
        deliveryStatus: order.deliveryStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        /**
         * The gateway's merchant transaction reference.
         *
         * Carried so a payment result screen can say *which* order a gateway
         * transaction became: the NPX return page has only the transaction id,
         * and without this there is no honest way to join the two, so it could
         * show no order summary at all. It is not a secret — the shopper's own
         * browser was redirected with it — and it is the reference support asks
         * for first.
         */
        mTransactionId: order.mTransactionId ?? null,
        appliedPromoCode: order.appliedPromoCode ?? null,
        promoApplyOn,
        phoneNumber: order.phoneNumber ?? null,
        isBuyNow: order.isBuyNow ?? false,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        orderedBy: order.orderedBy ? sanitizeUser(order.orderedBy) : null,
        shippingAddress: orderShippingAddress(order),
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
    /** The number the shopper gave at checkout: the one to call about this order. */
    phoneNumber: string | null;
    orderItems: SanitizedOrderItem[];
    itemsSubtotal: number;
    discountAllocation: number;
    appliedPromoCode: string | null;
    promoApplyOn: PromoType | null;
    vendorPayable: number;
    cancelledSubtotal: number;
    cancelledItemCount: number;
    /** The seller's settlement, line by line. Shipping is never part of it. */
    settlement: VendorSettlement;
}

/**
 * What a seller is owed on one order and how it is reached. Amounts are
 * rupees, exact to the paisa:
 *   listedTotal − productDiscount − dealDiscount = itemsTotal
 *   itemsTotal − promo.amount = payable
 * Cancelled lines are reported separately and are not payable.
 */
export interface VendorSettlement {
    listedTotal: number;
    productDiscount: number;
    dealDiscount: number;
    dealNames: string[];
    itemsTotal: number;
    /** The seller's share of an item promo; null when none applies. */
    promo: { code: string; amount: number } | null;
    cancelled: { count: number; amount: number } | null;
    payable: number;
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

    /*
     * A cancelled line is not owed to the vendor.
     *
     * The subtotal used to sum every line the vendor had on the order,
     * cancelled ones included, so `vendorPayable` paid them for goods that
     * were never sent. Cancelled lines are still returned — the vendor needs
     * to see what was dropped — but they are counted separately.
     */
    // A whole order cancelled or returned owes the seller nothing, even
    // though its lines were never cancelled one by one.
    const orderVoid =
        order.status === OrderStatus.CANCELLED || order.status === OrderStatus.RETURNED;
    const isCancelled = (item: OrderItem) =>
        orderVoid || item.fulfillmentStatus === ItemFulfillmentStatus.CANCELLED;

    const activeItems = vendorItems.filter((item) => !isCancelled(item));
    const cancelledItems = vendorItems.filter(isCancelled);

    // Everything below is counted in paisa, so the rows always add up
    // exactly to what is shown as payable.
    const paisa = (value: unknown) => Math.round((Number(value) || 0) * 100);
    const rupees = (value: number) => value / 100;

    const itemsTotal = activeItems.reduce((sum, item) => sum + paisa(item.price) * item.quantity, 0);
    const productDiscount = activeItems.reduce(
        (sum, item) => sum + paisa(item.productDiscountSnapshot) * item.quantity,
        0,
    );
    const dealDiscount = activeItems.reduce(
        (sum, item) => sum + paisa(item.dealDiscountSnapshot) * item.quantity,
        0,
    );
    // An old line without snapshots has no breakdown: its listed price is
    // what was charged. Otherwise the listed price is rebuilt from the parts,
    // so listed − own discount − deal is always exactly the items total.
    const hasBreakdown = activeItems.some((item) => item.basePriceSnapshot != null);
    const listedTotal = hasBreakdown ? itemsTotal + productDiscount + dealDiscount : itemsTotal;

    // A promo is shared across the order's sellers in proportion to their
    // merchandise. A SHIPPING promo discounts the customer's delivery, which
    // is not the seller's, so it is never deducted from them — and is not
    // shown to them at all.
    const promoApplyOn = order.promoApplyOn ?? null;
    const orderMerchandise = paisa(order.merchandiseSubtotal);
    const promoPaisa =
        promoApplyOn === PromoType.SHIPPING || orderMerchandise <= 0
            ? 0
            : Math.min(
                  itemsTotal,
                  Math.round((paisa(order.discountTotal) * itemsTotal) / orderMerchandise),
              );
    const cancelledPaisa = cancelledItems.reduce(
        (sum, item) => sum + paisa(item.price) * item.quantity,
        0,
    );
    const payable = itemsTotal - promoPaisa;

    const settlement: VendorSettlement = {
        listedTotal: rupees(listedTotal),
        productDiscount: rupees(hasBreakdown ? productDiscount : 0),
        dealDiscount: rupees(hasBreakdown ? dealDiscount : 0),
        dealNames: [
            ...new Set(
                activeItems
                    .filter((item) => paisa(item.dealDiscountSnapshot) > 0 && item.dealNameSnapshot)
                    .map((item) => item.dealNameSnapshot as string),
            ),
        ],
        itemsTotal: rupees(itemsTotal),
        promo:
            promoPaisa > 0 && order.appliedPromoCode
                ? { code: order.appliedPromoCode.toUpperCase(), amount: rupees(promoPaisa) }
                : null,
        cancelled: cancelledItems.length
            ? { count: cancelledItems.length, amount: rupees(cancelledPaisa) }
            : null,
        payable: rupees(payable),
    };

    return {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        deliveryStatus: order.deliveryStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        createdAt: order.createdAt,
        orderedBy: order.orderedBy ? sanitizeUser(order.orderedBy) : null,
        shippingAddress: orderShippingAddress(order),
        phoneNumber: order.phoneNumber ?? null,
        // Lines are rarely confirmed one by one, so a finished order would
        // still show each as "Pending": report what became of them instead.
        orderItems: vendorItems.map((item) => ({
            ...sanitizeOrderItem(item),
            fulfillmentStatus: isCancelled(item)
                ? ItemFulfillmentStatus.CANCELLED
                : order.status === OrderStatus.DELIVERED
                  ? ItemFulfillmentStatus.CONFIRMED
                  : (item.fulfillmentStatus ?? ItemFulfillmentStatus.PENDING),
        })),
        itemsSubtotal: settlement.itemsTotal,
        /** What was taken off by cancelling lines, as a positive figure. */
        cancelledSubtotal: rupees(cancelledPaisa),
        cancelledItemCount: cancelledItems.length,
        discountAllocation: rupees(promoPaisa),
        appliedPromoCode: settlement.promo ? settlement.promo.code : null,
        promoApplyOn: settlement.promo ? promoApplyOn : null,
        vendorPayable: settlement.payable,
        settlement,
    };
};
