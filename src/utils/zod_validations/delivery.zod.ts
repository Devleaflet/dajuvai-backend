import { z } from "zod";
import { AssignmentStatus } from "../../entities/deliveryAssignment.entity";
import { OrderStatus, PaymentMethod } from "../../entities/order.entity";

export const createRiderSchema = z.object({
    fullName: z.string().min(1, "full name is required"),
    email: z.string().email("invalid email"),
    phoneNumber: z.string().length(10, "phone number must be 10 digits long"),
    password: z.string().min(8, "password must be atleast 8 characters long"),
    documentUrl: z.string().url("invalid url")
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

export const bulkAssignRiderSchema = z.object({
    orderIds: z.array(z.number()).min(1, "at least one order ID is required"),
    riderId: z.number({ required_error: "rider Id is required" }),
});

/*
 * List queries. Every field is optional with a default, so the older clients
 * that send only `page`/`limit` (or nothing) keep getting what they got.
 */
const page = z.coerce.number().int().min(1).max(10_000).default(1);
const limit = (fallback: number) => z.coerce.number().int().min(1).max(100).default(fallback);
// A blank search is no search, not a match on "%%".
const search = z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => value || undefined);
const sort = z.enum(["newest", "oldest"]).default("newest");
const riderId = z.coerce.number().int().positive().optional();

export const deliveryOrdersQuerySchema = z.object({
    page,
    limit: limit(20),
    search,
    sort,
    // Comma-separated. An unknown status is refused rather than reaching
    // Postgres as an invalid enum literal and coming back as a 500.
    statuses: z
        .string()
        .optional()
        .transform((value) =>
            value
                ? value.split(",").map((status) => status.trim()).filter(Boolean)
                : undefined,
        )
        .pipe(z.array(z.nativeEnum(OrderStatus)).optional()),
    paymentMethod: z.nativeEnum(PaymentMethod).optional(),
    riderId,
});

export const deliveryAssignmentsQuerySchema = z.object({
    page,
    limit: limit(20),
    search,
    sort,
    // "active" is every assignment a rider is still carrying.
    status: z.union([z.literal("active"), z.nativeEnum(AssignmentStatus)]).optional(),
    riderId,
});

export const failedDeliveriesQuerySchema = z.object({
    page,
    // The list was unpaged; a client that asks for nothing still gets it whole
    // up to the cap.
    limit: limit(100),
    search,
    state: z.enum(["pending", "resolved"]).optional(),
    riderId,
});

export type DeliveryOrdersQuery = z.infer<typeof deliveryOrdersQuerySchema>;
export type DeliveryAssignmentsQuery = z.infer<typeof deliveryAssignmentsQuerySchema>;
export type FailedDeliveriesQuery = z.infer<typeof failedDeliveriesQuerySchema>;

export type CreateRiderType = z.infer<typeof createRiderSchema>;
export type AssignRiderType = z.infer<typeof assignRiderSchema>;
export type BulkAssignRiderType = z.infer<typeof bulkAssignRiderSchema>;
export type DeliveryFailedType = z.infer<typeof deliveryFailedSchema>;
export type ResetRiderPasswordType = z.infer<typeof resetRiderPasswordSchema>;
