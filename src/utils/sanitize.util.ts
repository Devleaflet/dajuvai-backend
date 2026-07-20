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

export interface SanitizedVendor {
    id: number;
    businessName: string;
    email: string;
    phoneNumber: string;
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
}

export const sanitizeVendorForAdmin = (
    vendor: Vendor,
): SanitizedVendorForAdmin => ({
    id: vendor.id,
    businessName: vendor.businessName,
    email: vendor.email,
    phoneNumber: vendor.phoneNumber,
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

export const sanitizeOrderItem = (item: OrderItem): SanitizedOrderItem => ({
    id: item.id,
    productId: item.productId,
    quantity: item.quantity,
    price: item.price,
    variantId: item.variantId ?? null,
    collectedAtWarehouse: item.collectedAtWarehouse,
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
    vendorId: item.vendorId ?? item.product.vendorId,
    vendor: item.vendor ? sanitizeVendor(item.vendor) : null,
});

export interface SanitizedOrderFull {
    id: number;
    totalPrice: number;
    shippingFee: number;
    serviceCharge: number;
    status: OrderStatus;
    deliveryStatus: DeliveryStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod;
    appliedPromoCode: string | null;
    phoneNumber: string | null;
    isBuyNow: boolean;
    createdAt: Date;
    updatedAt: Date;
    orderedBy: SanitizedUser | null;
    shippingAddress: Address | null;
    orderItems: SanitizedOrderItem[];
}

export const sanitizeOrderFull = (order: Order): SanitizedOrderFull => ({
    id: order.id,
    totalPrice: order.totalPrice,
    shippingFee: order.shippingFee,
    serviceCharge: order.serviceCharge,
    status: order.status,
    deliveryStatus: order.deliveryStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    appliedPromoCode: order.appliedPromoCode ?? null,
    phoneNumber: order.phoneNumber ?? null,
    isBuyNow: order.isBuyNow ?? false,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    orderedBy: order.orderedBy ? sanitizeUser(order.orderedBy) : null,
    shippingAddress: order.shippingAddress ?? null,
    orderItems: (order.orderItems ?? []).map(sanitizeOrderItem),
});
