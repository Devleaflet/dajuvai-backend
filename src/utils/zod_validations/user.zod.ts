import { z } from 'zod';
import { UserRole } from '../../entities/user.entity';

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


/**
 * Schema for user login input validation.
 * Validates email and password presence and format.
 */
export const loginSchema = z.object({
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
 * Schema for updating user profile.
 * Fields are optional: username, email, role.
 * Validates role against UserRole enum.
 */
export const updateUserSchema = z.object({
    username: z.string().min(1, 'Username is required').optional(),
    email: z.string().email('Invalid email format').optional(),
    role: z.nativeEnum(UserRole, { errorMap: () => ({ message: 'Invalid role' }) }).optional(),
});

/**
 * Schema for resetting user password.
 * Validates newPass, confirmPass, and token.
 * Ensures newPass and confirmPass match.
 */
export const resetPasswordSchema = z.object({
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

// Inferred TypeScript types
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerificationTokenInput = z.infer<typeof verificationTokenSchema>;
export type VerifyTokenInput = z.infer<typeof verifyTokenSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type VerifyEmailChangeInput = z.infer<typeof verifyEmailChangeSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
