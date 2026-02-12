import { z } from 'zod';
import { PaymentOption } from '../../entities/vendor.entity';

/**
 * Schema for vendor signup input validation.
 * Validates businessName, email, password, phoneNumber, and district.
 * Business address commented out but can be added as nested object if needed.
 */
export const vendorSignupSchema = z.object({
    businessName: z.string().min(3).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(25),
    phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/),
    telePhone: z.string().optional(),
    district: z.string().min(1),

    businessRegNumber: z.string().min(1, 'Business registration number is required'),
    taxNumber: z.string().optional(),
    taxDocuments: z.array(z.string().url()).min(1),
    citizenshipDocuments: z.array(z.string().url()).optional(),

    // bank detalil
    accountName: z.string().optional(),
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    bankBranch: z.string().optional(),
});


/**
 * Schema for vendor login input validation.
 * Validates email format and password length.
 */
export const vendorLoginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters long')
        .max(25, 'Password must not exceed 25 characters'),
});

/**
 * Schema to request verification token for vendor email.
 */
export const verificationTokenSchema = z.object({
    email: z.string().email('Invalid email format'),
});

/**
 * Schema to verify vendor token.
 * Token must be exactly 6 digits long.
 */
export const verifyTokenSchema = z.object({
    email: z.string().email('Invalid email format'),
    token: z.string().regex(/^\d{6}$/, 'Token must be 6 digits')
});

/**
 * Schema to reset vendor password.
 * Validates newPass, confirmPass, and token.
 * Ensures passwords match.
 */
export const resetPasswordSchema = z.object({
    newPass: z.string()
        .min(8, 'Password must be at least 8 characters long')
        .max(100, 'Password must not exceed 100 characters'),
    confirmPass: z.string()
        .min(8, 'Password must be at least 8 characters long')
        .max(100, 'Password must not exceed 100 characters'),
    token: z.string().regex(/^\d{6}$/, 'Token must be 6 digits')
}).refine((data) => data.newPass === data.confirmPass, {
    message: 'Passwords must match',
    path: ['confirmPass'],
});


/**
 * Schema to update vendor info.
 * Fields optional except for id which must be a positive integer.
 */
export const updateVendorSchema = vendorSignupSchema.partial();


// -------------------- v2 vendor regiter scehma - Add payment options for vendors ------------------------------------------------------

export const paymentOptionEnum = z.nativeEnum(PaymentOption);

/**
 * Wallet payment details schema
 * Used for: ESEWA, KHALTI, IMEPAY, FONEPAY
 */
const walletDetailsSchema = z.object({
    walletNumber: z.string().min(5, 'Wallet number is required'),
    accountName: z.string().optional(),
});

/**
 * Bank payment details schema (BANK)
 */
const bankDetailsSchema = z.object({
    accountNumber: z.string().min(5, 'Account number is required'),
    bankName: z.string().min(2, 'Bank name is required'),
    accountName: z.string().optional(),
    branch: z.string().optional(),
});

/**
 * Vendor Payment Option Schema
 */
export const vendorPaymentOptionSchema = z.discriminatedUnion('paymentType', [
    z.object({
        paymentType: z.literal(PaymentOption.ESEWA),
        details: walletDetailsSchema,
        qrCodeImage: z.string().url().optional().nullable(),
        isActive: z.boolean().optional(),
    }),
    z.object({
        paymentType: z.literal(PaymentOption.KHALTI),
        details: walletDetailsSchema,
        qrCodeImage: z.string().url().optional().nullable(),
        isActive: z.boolean().optional(),
    }),
    z.object({
        paymentType: z.literal(PaymentOption.BANK),
        details: bankDetailsSchema,
        qrCodeImage: z.string().url().optional().nullable(),
        isActive: z.boolean().optional(),
    }),
    z.object({
        paymentType: z.literal(PaymentOption.NPS),
        details: bankDetailsSchema,
        qrCodeImage: z.string().url().optional().nullable(),
        isActive: z.boolean().optional(),
    }),
]);


/**
 * Vendor Signup Schema v2 (with payment options)
 */
export const vendorSignupSchemav2 = z.object({
    businessName: z.string().min(3).max(100),
    email: z.string().email(),
    password: z.string().min(8).max(100),
    phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/),
    telePhone: z.string().optional(),
    district: z.string().min(1),

    businessRegNumber: z.string().min(1, 'Business registration number is required'),
    taxNumber: z.string().optional(),
    taxDocuments: z.array(z.string().url()).min(1),
    citizenshipDocuments: z.array(z.string().url()).optional(),

    paymentOptions: z
        .array(vendorPaymentOptionSchema)
        .optional()
        .superRefine((options, ctx) => {
            if (!options) return;

            const types = options.map((o) => o.paymentType);
            const uniqueTypes = new Set(types);

            if (uniqueTypes.size !== types.length) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Duplicate payment types are not allowed',
                });
            }
        }),

    accountName: z.string().optional(),
    bankName: z.string().optional(),
    accountNumber: z.string().optional(),
    bankBranch: z.string().optional(),
});

/**
 * Safer update schema
 */
export const updateVendorSchema2 = z.object({
    businessName: z.string().min(3).max(100).optional(),
    phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional(),
    telePhone: z.string().optional(),

    taxNumber: z.string().optional(),
    taxDocuments: z.array(z.string().url()).optional(),
    citizenshipDocuments: z.array(z.string().url()).optional(),

    district: z.string().optional(),

    paymentOptions: z
        .array(vendorPaymentOptionSchema)
        .optional()
        .superRefine((options, ctx) => {
            if (!options) return;

            const types = options.map((o) => o.paymentType);
            const uniqueTypes = new Set(types);

            if (uniqueTypes.size !== types.length) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: 'Duplicate payment types are not allowed',
                });
            }
        }),
});

export const updateVendorPaymentOptionSchema = z.object({
    details: z.record(z.any()).optional(),
    qrCodeImage: z.string().url().optional().nullable(),
    isActive: z.boolean().optional(),
}).refine(
    data => Object.keys(data).length > 0,
    { message: "At least one field must be provided" }
);


export type IVendorSignupRequestV2 = z.infer<typeof vendorSignupSchemav2>
export type IUpdateVendorRequestV2 = z.infer<typeof updateVendorSchema2>
export type IUpdateVendorPaymentOptionRequest = z.infer<typeof updateVendorPaymentOptionSchema>;