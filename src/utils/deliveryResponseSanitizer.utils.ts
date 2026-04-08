import type { Address } from "../entities/address.entity";
import type { DeliveryAssignment } from "../entities/deliveryAssignment.entity";
import type { Order } from "../entities/order.entity";
import type { OrderItem } from "../entities/orderItems.entity";
import type { Rider } from "../entities/rider.entity";
import type { User } from "../entities/user.entity";
import type { Vendor } from "../entities/vendor.entity";
import type { Product } from "../entities/product.entity";
import type { Variant } from "../entities/variant.entity";

/**
 * Delivery/Admin APIs often join relations (orderedBy, vendor, etc.).
 * Never return auth secrets / verification tokens / bank details in JSON.
 *
 * These helpers map TypeORM entities -> safe JSON DTOs.
 */

export function sanitizeUserForDelivery(user?: User | null) {
    if (!user) return null;
    return {
        id: user.id,
        fullName: user.fullName ?? null,
        username: user.username ?? null,
        email: user.email ?? null,
        phoneNumber: user.phoneNumber ?? null,
    };
}

export function sanitizeAddressForDelivery(address?: Address | null) {
    if (!address) return null;
    return {
        id: address.id,
        province: address.province ?? null,
        district: address.district ?? null,
        city: address.city,
        localAddress: address.localAddress ?? null,
        landmark: address.landmark ?? null,
    };
}

export function sanitizeRiderForDelivery(rider?: Rider | null) {
    if (!rider) return null;
    return {
        id: rider.id,
        fullName: rider.fullName ?? null,
        phoneNumber: rider.phoneNumber,
        email: rider.email ?? null,
        onDelivery: rider.onDelivery,
        userId: rider.userId ?? null,
        createdAt: (rider as any).createdAt ?? null,
        updatedAt: (rider as any).updatedAt ?? null,
    };
}

export function sanitizeVendorForDelivery(vendor?: Vendor | null) {
    if (!vendor) return null;
    return {
        id: vendor.id,
        businessName: vendor.businessName,
        phoneNumber: vendor.phoneNumber,
        district: vendor.district
            ? { id: vendor.district.id, name: vendor.district.name }
            : null,
    };
}

export function sanitizeProductForDelivery(product?: Product | null) {
    if (!product) return null;
    return {
        id: product.id,
        name: product.name,
        productImages: product.productImages ?? [],
        finalPrice: product.finalPrice ?? null,
        basePrice: product.basePrice ?? null,
        discount: product.discount ?? null,
        discountType: product.discountType ?? null,
        hasVariants: product.hasVariants,
        status: product.status ?? null,
        stock: product.stock ?? null,
    };
}

export function sanitizeVariantForDelivery(variant?: Variant | null) {
    if (!variant) return null;
    return {
        id: variant.id,
        sku: variant.sku,
        finalPrice: variant.finalPrice ?? null,
        attributes: variant.attributes ?? null,
        variantImages: variant.variantImages ?? [],
    };
}

export function sanitizeOrderItemForDelivery(item?: OrderItem | null) {
    if (!item) return null;
    return {
        id: item.id,
        productId: item.productId,
        quantity: item.quantity,
        price: item.price,
        orderId: item.orderId,
        vendorId: item.vendorId,
        variantId: item.variantId ?? null,
        collectedAtWarehouse: item.collectedAtWarehouse,
        createdAt: item.createdAt,
        product: sanitizeProductForDelivery((item as any).product),
        variant: sanitizeVariantForDelivery((item as any).variant),
        vendor: sanitizeVendorForDelivery((item as any).vendor),
    };
}

export function sanitizeOrderForDelivery(order?: Order | null) {
    if (!order) return null;
    return {
        id: order.id,
        orderedById: order.orderedById,
        totalPrice: order.totalPrice,
        shippingFee: order.shippingFee,
        serviceCharge: order.serviceCharge,
        isBuyNow: order.isBuyNow ?? false,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        status: order.status,
        deliveryStatus: order.deliveryStatus,
        appliedPromoCode: (order as any).appliedPromoCode ?? null,
        phoneNumber: (order as any).phoneNumber ?? null,
        instrumentName: (order as any).instrumentName ?? null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        orderedBy: sanitizeUserForDelivery((order as any).orderedBy),
        shippingAddress: sanitizeAddressForDelivery((order as any).shippingAddress),
        orderItems: Array.isArray((order as any).orderItems)
            ? (order as any).orderItems.map((i: OrderItem) =>
                  sanitizeOrderItemForDelivery(i),
              )
            : [],
    };
}

export function sanitizeAssignmentForDelivery(a?: DeliveryAssignment | null) {
    if (!a) return null;
    return {
        id: a.id,
        orderId: a.orderId,
        riderId: a.riderId,
        assignmentStatus: a.assignmentStatus,
        pickedUpAt: a.pickedUpAt ?? null,
        deliveredAt: a.deliveredAt ?? null,
        failureReason: a.failureReason ?? null,
        createdAt: a.createdAt,
        updatedAt: a.updatedAt,
        rider: sanitizeRiderForDelivery((a as any).rider),
        order: sanitizeOrderForDelivery((a as any).order),
    };
}
