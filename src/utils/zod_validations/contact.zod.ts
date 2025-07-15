import { z } from "zod";

export const contactSchema = z.object({
    // First name is required
    firstName: z
        .string()
        .min(1, "First name is required"),

    // Last name is required
    lastName: z
        .string()
        .min(1, "Last name is required"),

    // Must be a valid email address
    email: z
        .string()
        .email('Invalid email address'),

    // Phone number must be exactly 10 characters
    phone: z
        .string()
        .max(10, 'Phone number cannot exceed 10 characters')
        .min(10, "Phone number must be 10 character long"),

    // Subject is required and max 255 characters
    subject: z
        .string()
        .min(1, 'Subject is required')
        .max(255, 'Subject cannot exceed 255 characters'),

    // Message is required
    message: z
        .string()
        .min(1, 'Message is required'),
});

export const adminContactQuerySchema = z.object({
    // Page number: optional, defaults to 1, must be positive integer
    page: z
        .string()
        .transform(Number)
        .refine((val) => Number.isInteger(val) && val >= 1, { message: "Page must be a positive integer" })
        .optional()
        .default('1'),

    // Limit per page: optional, defaults to 7, must be positive integer
    limit: z
        .string()
        .transform(Number)
        .refine((val) => Number.isInteger(val) && val >= 1, { message: "Limit must be a positive integer" })
        .optional()
        .default('7'),
});

export type AdminContactQueryInput = z.infer<typeof adminContactQuerySchema>;
export type ContactInput = z.infer<typeof contactSchema>;
