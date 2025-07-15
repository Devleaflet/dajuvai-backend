
import { z } from 'zod';

/**
 * Enum schema for Nepal provinces used in shipping addresses.
 */
const ProvinceEnum = z.enum([
    'Province 1',
    'Madhesh',
    'Bagmati',
    'Gandaki',
    'Lumbini',
    'Karnali',
    'Sudurpashchim',
]);


/**
 * Enum schema representing allowed order statuses.
 */
const OrderStatusEnum = z.enum([
    'PENDING',
    'CONFIRMED',
    'CANCELLED',
    'DELIVERED'
]);


/**
 * Enum schema for supported payment methods.
 */
const PaymentMethodEnum = z.enum(['ONLINE_PAYMENT', 'CASH_ON_DELIVERY', "KHALTI", "ESEWA"]);

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
    promoCode: z.string().optional()
});


/**
 * Schema for validating updates to order status.
 * 
 * Requires:
 * - status: must be a valid OrderStatusEnum value.
 */
export const updateOrderStatusSchema = z.object({
    status: OrderStatusEnum,
});