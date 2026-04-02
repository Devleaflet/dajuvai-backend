import { z } from "zod";

export const createRiderSchema = z.object({
    fullName: z.string().min(1, "full name is required"),
    email: z.string().email("invalid email"),
    phoneNumber: z.string().length(10, "phone number must be 10 digits long"),
    password: z.string().min(8, "password must be atleast 8 characters long"),
});

export const assignRiderSchema = z.object({
    riderId: z.number({ required_error: "rider Id is required" }),
});

export const deliveryFailedSchema = z.object({
    failedReason: z.string().min(1, "failure reason is required"),
});

export const resetRiderPasswordSchema = z.object({
    newPassword: z.string().min(8, "password must be at least 8 characters long"),
});

export type CreateRiderType = z.infer<typeof createRiderSchema>;
export type AssignRiderType = z.infer<typeof assignRiderSchema>;
export type DeliveryFailedType = z.infer<typeof deliveryFailedSchema>;
export type ResetRiderPasswordType = z.infer<typeof resetRiderPasswordSchema>;
