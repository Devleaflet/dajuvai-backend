import { z } from 'zod';
import { UserRole } from '../../entities/user.entity';
import { Province } from '../../entities/address.entity';
import { ModuleName, PermissionLevel } from '../../entities/permission.enum';

/**
 * Schema for user signup input validation.
 * Validates username, email, password, and confirmPassword.
 * Ensures password and confirmPassword match.
 */
export const signupSchema = z.object({
    username: z.string().min(1, 'Username is required'),
    email: z.string().email('Invalid email format'),
    password: z.string()
        .min(8, 'Password must be at least 8 characters long')
        .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
    confirmPassword: z.string()
        .min(8, 'Password must be at least 8 characters long')
        .regex(/[A-Z]/, 'Confirm password must contain at least one uppercase letter')
        .regex(/[a-z]/, 'Confirm password must contain at least one lowercase letter')
        .regex(/[0-9]/, 'Confirm password must contain at least one number')
        .regex(/[^A-Za-z0-9]/, 'Confirm password must contain at least one special character'),
}).refine(data => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

export const staffSignupSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters long'),
    phoneNumber: z.string().length(10, "Phone number must have 10 digits"),
    fullName: z.string().optional(),
    permissions: z.object({
        order: z.nativeEnum(PermissionLevel).optional(),
        delivery: z.nativeEnum(PermissionLevel).optional(),
        catalog: z.nativeEnum(PermissionLevel).optional(),
        promo: z.nativeEnum(PermissionLevel).optional(),
        deal: z.nativeEnum(PermissionLevel).optional(),
        vendor: z.nativeEnum(PermissionLevel).optional(),
        banner: z.nativeEnum(PermissionLevel).optional(),
        arrangement: z.nativeEnum(PermissionLevel).optional(),
        customer: z.nativeEnum(PermissionLevel).optional(),
        product: z.nativeEnum(PermissionLevel).optional(),
        audit: z.nativeEnum(PermissionLevel).optional(),
    })
})

/**
 * Schema for user login input validation.
 * Validates email and password presence and format.
 */
export const loginSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
});

/**
 * Schema for user self-deletion requests.
 * Email is always required; password only for email/password accounts
 * (Google OAuth accounts have no password and rely on the active session).
 */
export const userDeleteAccountSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required').optional(),
    confirmation: z.literal('DELETE'),
});

/**
 * Schema for reactivating an account scheduled for deletion
 * (email/password accounts only; OAuth accounts reactivate via sign-in).
 */
export const userReactivateSchema = z.object({
    email: z.string().email('Invalid email format'),
    password: z.string().min(1, 'Password is required'),
});

/**
 * Schema for requesting email verification token.
 * Validates email format.
 */
export const verificationTokenSchema = z.object({
    email: z.string().email('Invalid email format'),
});

/**
 * Schema for verifying email token.
 * Validates email and token presence and format.
 */
export const verifyTokenSchema = z.object({
    email: z.string().email('Invalid email format'),
    token: z.string().min(1, 'Token is required'),
});

/**
 * Schema for updating a staff member (admin-only).
 * Fields are optional but at least one must be provided.
 * If password is provided, confirmPassword must match and meet the same
 * complexity rules enforced at signup.
 */
const permissionsSchema = z.object({
    order: z.nativeEnum(PermissionLevel).optional(),
    delivery: z.nativeEnum(PermissionLevel).optional(),
    catalog: z.nativeEnum(PermissionLevel).optional(),
    promo: z.nativeEnum(PermissionLevel).optional(),
    deal: z.nativeEnum(PermissionLevel).optional(),
    vendor: z.nativeEnum(PermissionLevel).optional(),
    banner: z.nativeEnum(PermissionLevel).optional(),
    arrangement: z.nativeEnum(PermissionLevel).optional(),
    customer: z.nativeEnum(PermissionLevel).optional(),
    category: z.nativeEnum(PermissionLevel).optional(),
    product: z.nativeEnum(PermissionLevel).optional(),
    audit: z.nativeEnum(PermissionLevel).optional(),
}).optional();

export const updateStaffSchema = z.object({
    email: z.string().email("Invalid email format").optional(),
    fullName: z.string().min(1, "Full name is required").optional(),
    phoneNumber: z
        .string()
        .regex(/^[0-9]{7,15}$/, "Invalid phone number")
        .optional(),
    password: z.string()
        .min(8, "Password must be at least 8 characters long")
        .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
        .regex(/[a-z]/, "Password must contain at least one lowercase letter")
        .regex(/[0-9]/, "Password must contain at least one number")
        .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character")
        .optional(),
    confirmPassword: z.string().optional(),
    permissions: permissionsSchema,
}).refine(data => Object.keys(data).length > 0, {
    message: "At least one field is required",
}).refine(data => !data.password || data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
});

/**
 * Schema for updating user profile.
 * Fields are optional: username, email, role.
 * Validates role against UserRole enum.
 */
export const updateUserSchema = z.object({
    fullName: z.string().min(1, "Full name is required").optional(),
    username: z.string().min(1, "Username is required").optional(),
    email: z.string().email("Invalid email format").optional(),
    phoneNumber: z
        .string()
        .regex(/^[0-9]{7,15}$/, "Invalid phone number")
        .optional(),
    role: z.nativeEnum(UserRole, {
        errorMap: () => ({ message: "Invalid role" }),
    }).optional(),
    profilePicture: z.string().url("Invalid profile picture URL").optional(),
    address: z
        .object({
            province: z.nativeEnum(Province).optional(),
            district: z.string().optional(),
            city: z.string().min(1, "City is required").optional(),
            localAddress: z.string().optional(),
            landmark: z.string().optional(),
        })
        .optional(),

});

/**
 * Schema for resetting user password.
 * Validates newPass, confirmPass, and token.
 * Ensures newPass and confirmPass match.
 */
export const resetPasswordSchema = z.object({
    email: z.string().email('Invalid email format'),
    newPass: z.string().min(8, 'New password must be at least 8 characters long'),
    confirmPass: z.string().min(1, 'Confirm password is required'),
    token: z.string().min(1, 'Token is required'),
}).refine(data => data.newPass === data.confirmPass, {
    message: 'Passwords do not match',
    path: ['confirmPass'],
});

/**
 * Schema for requesting email change.
 * Validates newEmail format.
 */
export const changeEmailSchema = z.object({
    newEmail: z.string().email('Invalid email format'),
});

/**
 * Schema for verifying email change request.
 * Validates presence of token and emailChangeToken.
 */
export const verifyEmailChangeSchema = z.object({
    token: z.string().min(1, 'Token is required'),
    emailChangeToken: z.string().min(1, 'Email change token is required'),
});

export const adminResetPasswordSchema = z.object({
    newPass: z.string()
        .min(8, 'New password must be at least 8 characters long')
        .regex(/[0-9]/, 'Password must contain at least one number')
        .regex(/[A-Z]/, 'Password must contain at least one capital letter')
        .regex(/[^a-zA-Z0-9]/, 'Password must contain at least one symbol'),
    confirmPass: z.string().min(1, 'Confirm password is required'),
}).refine(data => data.newPass === data.confirmPass, {
    message: 'Passwords do not match',
    path: ['confirmPass'],
});

// Inferred TypeScript types
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerificationTokenInput = z.infer<typeof verificationTokenSchema>;
export type VerifyTokenInput = z.infer<typeof verifyTokenSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type VerifyEmailChangeInput = z.infer<typeof verifyEmailChangeSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UpdateStaffInput = z.infer<typeof updateStaffSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
export type StaffSignUpInput = z.infer<typeof staffSignupSchema>
