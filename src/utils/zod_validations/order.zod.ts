
import { z } from 'zod';
import { OrderStatus } from '../../entities/order.entity';
import { PaymentMethod } from '../../entities/order.entity';
import { ItemFulfillmentStatus } from '../../entities/orderItems.entity';

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
const PaymentMethodEnum = z.nativeEnum(PaymentMethod);

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
    // Digits, not merely ten characters: "98AB345678" is the right length and
    // is not a phone number, and it reached the order record unchallenged.
    phoneNumber: z
        .string()
        .regex(/^\d{10}$/, "Phone number must be 10 digits"),
    promoCode: z.string().optional(),
    fullName: z.string().optional(),
    isBuyNow: z.boolean().optional(),
    productId: z.number().int().optional(),
    variantId: z.number().optional(),
    quantity: z.number().int().positive().optional().default(1),
    ageRestrictedAcknowledged: z.boolean().optional().default(false),
    /** Carried through to the order so the charge shown at checkout is stored. */
    serviceCharge: z.number().nonnegative().optional(),
    /** Which instrument the gateway reported, for reconciliation. */
    instrumentName: z.string().trim().min(1).optional(),
    /** Lets a retried checkout resolve to the same order rather than a second. */
    idempotencyKey: z.string().trim().min(1).optional(),
}).superRefine((values, context) => {
    // Buy Now skips the cart, so the product is the only thing saying what is
    // being bought. Without it the order is created with nothing in it.
    if (values.isBuyNow && values.productId === undefined) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "productId is required for a Buy Now order",
            path: ["productId"],
        });
    }
});

export const mobileCheckoutEstimateSchema = z.object({
    shippingAddress: shippingAddressSchema,
    promoCode: z.string().trim().max(80).optional(),
    isBuyNow: z.boolean().optional(),
    productId: z.number().int().positive().optional(),
    variantId: z.number().int().positive().optional(),
    quantity: z.number().int().positive().optional(),
}).superRefine((values, context) => {
    // Same reasoning as above: an estimate for a Buy Now with no product is an
    // estimate of nothing.
    if (values.isBuyNow && values.productId === undefined) {
        context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "productId is required for a Buy Now estimate",
            path: ["productId"],
        });
    }
});


/**
 * Schema for validating updates to order status.
 *
 * `reason` is now required — every admin/rider status change must be
 * attributable, not just optionally so. `note` stays optional for
 * additional free-text context.
 */
export const updateOrderStatusSchema = z.object({
    status: OrderStatusEnum,
    // Optimistic-concurrency guard: if provided and it no longer matches the
    // order's current status, the update is rejected with 409 instead of
    // silently overwriting a change another admin/rider/webhook just made.
    expectedCurrentStatus: OrderStatusEnum.optional(),
    reason: z.string().min(1, "Reason is required").max(500),
    note: z.string().max(1000).optional(),
});

/**
 * Schema for item-level fulfillment updates (multi-vendor partial
 * availability). CANCELLED requires a meaningful, non-blank cancellation
 * remark (spec §5) — null, empty and whitespace-only values are rejected.
 * CONFIRMED needs no remark.
 */
export const updateOrderItemFulfillmentSchema = z
    .object({
        status: z.nativeEnum(ItemFulfillmentStatus),
        cancellationRemark: z
            .string()
            .trim()
            .max(1000, "Cancellation remark must not exceed 1000 characters")
            .optional()
            .nullable(),
    })
    .superRefine((data, ctx) => {
        if (
            data.status === ItemFulfillmentStatus.CANCELLED &&
            (!data.cancellationRemark ||
                data.cancellationRemark.trim().length === 0)
        ) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["cancellationRemark"],
                message:
                    "Cancellation remark is required when cancelling an item",
            });
        }
    });
