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

// GET /api/notification list query. Both optional and left undefined when the
// caller sends neither: the admin web app already calls this endpoint with no
// query params and expects the full unpaginated array back, and that must keep
// working. Mobile (or any new caller) opts into paging by sending both.
export const getNotificationsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
});

export type GetNotificationsQuery = z.infer<typeof getNotificationsQuerySchema>;
