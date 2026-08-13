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

// GET /api/notification list query. Every caller receives bounded pagination;
// unreadOnly keeps filtering server-side so clients never download full feeds.
export const getNotificationsQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    unreadOnly: z.preprocess(
        (value) => value === undefined ? false : value === true || value === "true" ? true : value === false || value === "false" ? false : value,
        z.boolean(),
    ).default(false),
});

export type GetNotificationsQuery = z.infer<typeof getNotificationsQuerySchema>;
