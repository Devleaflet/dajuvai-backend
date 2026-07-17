import { z } from "zod";
import { DevicePlatform } from "../../entities/deviceToken.entity";
import { DispatchType, DispatchStatus, DispatchPriority } from "../../entities/notificationDispatch.entity";

// FCM caps the whole data payload at 4KB. 10 pairs keeps us well clear of it.
const dataSchema = z
    .record(z.string(), z.string())
    .refine((d) => Object.keys(d).length <= 10, "data can't exceed 10 key-value pairs")
    .optional();

const messageFields = {
    title: z.string().min(1, "Title is required").max(200, "Title can't exceed 200 characters"),
    body: z.string().min(1, "Body is required").max(1000, "Body can't exceed 1000 characters"),
    imageUrl: z.string().url("imageUrl must be a valid URL").max(500).optional(),
    data: dataSchema,
    priority: z.nativeEnum(DispatchPriority).default(DispatchPriority.HIGH),
};

export const registerDeviceSchema = z.object({
    fcmToken: z
        .string({ required_error: "Valid FCM token is required" })
        .min(20, "Valid FCM token is required")
        .max(4096, "FCM token is too long"),
    deviceId: z.string({ required_error: "Device ID is required" }).min(1, "Device ID is required").max(255),
    platform: z.nativeEnum(DevicePlatform, {
        errorMap: () => ({ message: "Platform must be android, ios, or web" }),
    }),
    appVersion: z.string().max(20).optional(),
    deviceModel: z.string().max(100).optional(),
    osVersion: z.string().max(50).optional(),
});

export const sendToUserSchema = z.object({
    userId: z.coerce.number().int().positive("userId is required"),
    ...messageFields,
});

export const sendToUsersSchema = z.object({
    userIds: z
        .array(z.coerce.number().int().positive())
        .min(1, "At least one userId is required")
        .max(1000, "Can't target more than 1000 users at once"),
    ...messageFields,
});

export const sendToTopicSchema = z.object({
    // Firebase's own allowed topic charset.
    topic: z
        .string({ required_error: "Topic is required" })
        .max(100)
        .regex(/^[a-zA-Z0-9-_.~%]+$/, "Topic name contains invalid characters"),
    ...messageFields,
});

export const dispatchQuerySchema = z
    .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        status: z.nativeEnum(DispatchStatus).optional(),
        type: z.nativeEnum(DispatchType).optional(),
        targetUserId: z.coerce.number().int().positive().optional(),
        sentBy: z.coerce.number().int().positive().optional(),
        startDate: z.string().datetime({ offset: true }).optional(),
        endDate: z.string().datetime({ offset: true }).optional(),
    })
    .refine(
        (q) => !q.startDate || !q.endDate || new Date(q.endDate) >= new Date(q.startDate),
        { message: "endDate must be after startDate", path: ["endDate"] },
    );

/**
 * Written out rather than derived with z.infer: this tsconfig leaves
 * strictNullChecks off, under which zod widens every inferred field to
 * optional. These describe what validateZod actually guarantees downstream.
 */
export interface PushMessageInput {
    title: string;
    body: string;
    imageUrl?: string;
    data?: Record<string, string>;
    priority: DispatchPriority;
}

export interface RegisterDeviceInput {
    fcmToken: string;
    deviceId: string;
    platform: DevicePlatform;
    appVersion?: string;
    deviceModel?: string;
    osVersion?: string;
}

export interface SendToUserInput extends PushMessageInput {
    userId: number;
}

export interface SendToUsersInput extends PushMessageInput {
    userIds: number[];
}

export interface SendToTopicInput extends PushMessageInput {
    topic: string;
}

export interface DispatchQueryInput {
    page: number;
    limit: number;
    status?: DispatchStatus;
    type?: DispatchType;
    targetUserId?: number;
    sentBy?: number;
    startDate?: string;
    endDate?: string;
}
