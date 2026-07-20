
import { z } from 'zod';
import { OrderStatus } from '../../entities/order.entity';
import { VendorOrderStatus } from '../../entities/orderVendorShipping.entity';

/**
 * Enum schema for Nepal provinces used in shipping addresses.
 */
const ProvinceEnum = z.enum([
    'Koshi',
    'Madhesh',
    'Bagmati',
    'Gandaki',
    'Lumbini',
    'Karnali',
    'Sudurpashchim',
]);


/**
 * Order-status schema. Derived directly from the OrderStatus DB enum
 * (entities/order.entity.ts) instead of a hand-duplicated list — this was
 * exactly the bug: this list used to be a stale subset of the real enum
 * (missing PROCESSING/SHIPPED/DELAYED/RETURNED), so legitimate status
 * updates failed Zod validation before ever reaching the service layer.
 */
const OrderStatusEnum = z.nativeEnum(OrderStatus);


/**
 * Enum schema for supported payment methods.
 */
const PaymentMethodEnum = z.enum(['ONLINE_PAYMENT', 'CASH_ON_DELIVERY', "KHALTI", "ESEWA", "NPX"]);

/**
 * Shipping address validation schema.
 * 
 * Validates required fields and length constraints:
 * - province must be a valid Nepal province.
 * - district is required and non-empty string.
 * - city must be between 2 and 100 characters.
 * - streetAddress must be between 5 and 255 characters.
 */
export const shippingAddressSchema = z.object({
    province: ProvinceEnum,
    district: z.string().min(1, 'District is required'),
    city: z.string().min(2, 'City must be at least 2 characters long').max(100, 'City must not exceed 100 characters'),
    streetAddress: z
        .string()
        .min(5, 'streetAddress must be at least 5 characters long')
        .max(255, 'streetAddress must not exceed 255 characters'),
    landmark: z
        .string()
        .optional()
});

/**
 * Schema for validating order creation input.
 * 
 * Requires:
 * - shippingAddress: validated by shippingAddressSchema.
 * - paymentMethod: must be a valid PaymentMethodEnum value.
 */
export const createOrderSchema = z.object({
    shippingAddress: shippingAddressSchema,
    paymentMethod: PaymentMethodEnum,
    phoneNumber: z.string()
        .min(10, "Phone number must be 10 digits").max(10, "Phone number must be 10 digits"),
    promoCode: z.string().optional(),
    fullName: z.string().optional(),
    isBuyNow: z.boolean().optional(),
    productId: z.number().int().optional(),
    variantId: z.number().optional(),
    quantity: z.number().int().positive().optional().default(1), 
});


/**
 * Schema for validating updates to order status.
 * 
 * Requires:
 * - status: must be a valid OrderStatusEnum value.
 */
export const updateOrderStatusSchema = z.object({
    status: OrderStatusEnum,
    // Optimistic-concurrency guard: if provided and it no longer matches the
    // order's current status, the update is rejected with 409 instead of
    // silently overwriting a change another admin/vendor/webhook just made.
    expectedCurrentStatus: OrderStatusEnum.optional(),
    reason: z.string().max(500).optional(),
    note: z.string().max(1000).optional(),
});

/**
 * Schema for a vendor updating its own fulfillment stage for an order.
 * Deliberately a separate, narrower enum than the admin order-status
 * schema — a vendor can never set DELIVERED or any parent-order-only value.
 */
export const updateVendorOrderStatusSchema = z.object({
    status: z.nativeEnum(VendorOrderStatus),
    reason: z.string().max(500).optional(),
    note: z.string().max(1000).optional(),
});