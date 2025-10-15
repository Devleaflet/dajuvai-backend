import { z } from "zod";
import { NotificationTarget, NotificationType } from "../../entities/notification.entity";

// Common base schema
const baseNotificationSchema = z.object({
    title: z.string({
        required_error: "Title is required",
    }).min(3, "Title must be at least 3 characters long").max(50, "Title can't exceed 50 characters"),

    message: z.string({
        required_error: "Message is required",
    }).min(5, "Message must be at least 5 characters long"),

    type: z.nativeEnum(NotificationType).default(NotificationType.GENERAL),

    target: z.nativeEnum(NotificationTarget, {
        required_error: "Notification target is required",
    }),

    isRead: z.boolean().optional().default(false),

    link: z.string().url("Invalid URL format").optional().nullable(),

    vendorId: z.number().optional().nullable(),
    createdById: z.number().optional().nullable(),
    orderId: z.number().optional().nullable(),
});


export const createNotificationSchema = baseNotificationSchema;

export const updateNotificationSchema = baseNotificationSchema.partial(); 

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type UpdateNotificationInput = z.infer<typeof updateNotificationSchema>;
