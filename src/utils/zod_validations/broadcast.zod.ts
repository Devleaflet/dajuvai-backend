import { z } from "zod";
import {
    BroadcastActionType,
    BroadcastAudienceType,
    BroadcastChannel,
    BroadcastDeliveryStatus,
    BroadcastStatus,
} from "../../entities/broadcast.entity";
import { actionProblem } from "../broadcast.utils";

/** The most people one hand-picked audience may name. */
export const MAX_SELECTED_RECIPIENTS = 5000;

const emptyToNull = (value: unknown) => (typeof value === "string" && value.trim() === "" ? null : value);

const idList = z
    .array(z.coerce.number().int().positive())
    .max(MAX_SELECTED_RECIPIENTS, `At most ${MAX_SELECTED_RECIPIENTS} recipients can be picked by hand`)
    .transform((ids) => [...new Set(ids)])
    .nullish();

const audienceFields = {
    audienceType: z.nativeEnum(BroadcastAudienceType),
    selectedUserIds: idList,
    selectedVendorIds: idList,
};

const requireSelection = (
    value: { audienceType?: BroadcastAudienceType; selectedUserIds?: number[] | null; selectedVendorIds?: number[] | null },
    ctx: z.RefinementCtx,
) => {
    if (value.audienceType === BroadcastAudienceType.SELECTED_USERS && !value.selectedUserIds?.length)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedUserIds"], message: "Pick at least one customer" });
    if (value.audienceType === BroadcastAudienceType.SELECTED_VENDORS && !value.selectedVendorIds?.length)
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["selectedVendorIds"], message: "Pick at least one vendor" });
};

const broadcastFields = z.object({
    name: z.string().trim().min(1, "Name the broadcast").max(200),
    ...audienceFields,
    channels: z
        .array(z.nativeEnum(BroadcastChannel))
        .min(1, "Choose at least one channel")
        .refine((values) => new Set(values).size === values.length, "A channel is listed twice"),
    title: z.string().trim().min(1, "Enter a title").max(200),
    body: z.string().trim().min(1, "Enter a message").max(2000),
    emailSubject: z.preprocess(emptyToNull, z.string().trim().max(200).nullish()),
    imageUrl: z.preprocess(
        emptyToNull,
        z.string().trim().max(500).url("Enter a full image link").startsWith("https://", "Image links must use https").nullish(),
    ),
    actionType: z
        .nativeEnum(BroadcastActionType)
        .refine((value) => value !== BroadcastActionType.OPEN_ORDER, "A broadcast cannot open one order")
        .default(BroadcastActionType.NONE),
    actionValue: z.preprocess(emptyToNull, z.string().trim().max(255).nullish()),
});

const checkAction = (
    value: { actionType?: BroadcastActionType; actionValue?: string | null },
    ctx: z.RefinementCtx,
) => {
    if (value.actionType === undefined) return;
    const problem = actionProblem(value.actionType, value.actionValue);
    if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["actionValue"], message: problem });
};

export const createBroadcastSchema = broadcastFields.superRefine((value, ctx) => {
    requireSelection(value, ctx);
    checkAction(value, ctx);
});

// A draft edit sends the whole form again, so the same rules apply in full.
export const updateBroadcastSchema = createBroadcastSchema;

export const previewBroadcastSchema = z.object(audienceFields).superRefine(requireSelection);

export const sendBroadcastSchema = z.object({
    // Absent or null sends now.
    scheduledAt: z.preprocess(emptyToNull, z.string().datetime({ offset: true }).nullish()),
});

export const testBroadcastSchema = z
    .object({
        userId: z.coerce.number().int().positive().optional(),
        vendorId: z.coerce.number().int().positive().optional(),
    })
    .refine((value) => !(value.userId && value.vendorId), "Test one recipient at a time");

export const broadcastListQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    status: z.nativeEnum(BroadcastStatus).optional(),
    search: z.string().trim().max(100).optional(),
});

export const broadcastDeliveriesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    channel: z.nativeEnum(BroadcastChannel).optional(),
    status: z.nativeEnum(BroadcastDeliveryStatus).optional(),
});

export const broadcastIdParamSchema = z.object({ id: z.string().uuid("Unknown broadcast") });

export const unsubscribeSchema = z.object({ token: z.string().trim().min(1).max(200) });

export type CreateBroadcastInput = z.infer<typeof createBroadcastSchema>;
export type PreviewBroadcastInput = z.infer<typeof previewBroadcastSchema>;
export type BroadcastListQuery = z.infer<typeof broadcastListQuerySchema>;
export type BroadcastDeliveriesQuery = z.infer<typeof broadcastDeliveriesQuerySchema>;

const idsParam = z
    .string()
    .trim()
    .max(2000)
    .transform((raw) => raw.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0))
    .optional();

export const recipientSearchQuerySchema = z.object({
    kind: z.enum(["user", "vendor"]),
    q: z.string().trim().max(100).default(""),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    /** Labels for people already picked, e.g. when reopening a draft. */
    ids: idsParam,
    /** "1": every matching id, for "select all matching". */
    all: z.enum(["0", "1"]).default("0"),
});

export const targetSearchQuerySchema = z.object({
    type: z.enum(["product", "store", "category", "subcategory"]),
    q: z.string().trim().max(100).default(""),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    ids: idsParam,
});

export type RecipientSearchQuery = z.infer<typeof recipientSearchQuerySchema>;
export type TargetSearchQuery = z.infer<typeof targetSearchQuerySchema>;
