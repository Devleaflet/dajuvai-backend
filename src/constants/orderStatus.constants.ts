import { OrderStatus } from "../entities/order.entity";

export type StatusActorRole = "ADMIN" | "RIDER" | "SYSTEM";

/**
 * Single authoritative permission check for Order.status changes.
 * order.service.ts's changeOrderStatus() is the only place that mutates
 * Order.status, and it must always check this first — do not duplicate
 * this logic elsewhere in the backend.
 *
 * ADMIN/STAFF (both map to actorRole "ADMIN" — the history table's
 * changedByRole enum has no separate STAFF value, matching existing
 * behavior in order.controller.ts) and SYSTEM (internal webhook/cron
 * transitions, whose target is always hardcoded by trusted server code,
 * never derived from user input) may move to any status at any time.
 * RIDER may only report the outcome of a delivery already assigned to
 * them — delivery.rider.service.ts additionally verifies the assignment
 * itself belongs to the calling rider before invoking this.
 *
 * The frontend keeps its own mirrored copy (Components/orderStatus.ts)
 * since there's no shared package between the two repos; keep both in
 * sync when this changes.
 */
export function canTransition(
    role: StatusActorRole,
    from: OrderStatus,
    to: OrderStatus,
): boolean {
    if (role === "ADMIN" || role === "SYSTEM") return true;

    if (role === "RIDER") {
        return (
            from === OrderStatus.ASSIGNED_TO_RIDER &&
            (to === OrderStatus.DELIVERED || to === OrderStatus.NOT_RECEIVED)
        );
    }

    return false;
}

export const ALL_ORDER_STATUSES: OrderStatus[] = Object.values(OrderStatus);

/**
 * Statuses where something went wrong for the customer. Only these carry a
 * reason to the customer (email, in-app, push), and the reason is required;
 * on every other status the reason and note stay internal to the timeline.
 */
export const CUSTOMER_REASON_STATUSES: ReadonlySet<OrderStatus> = new Set([
    OrderStatus.DELAYED,
    OrderStatus.CANCELLED,
    OrderStatus.NOT_RECEIVED,
    OrderStatus.RETURNED,
]);

/**
 * Statuses worth an email. Every other change reaches people through the
 * in-app feed and push only, which saves the mail quota. ORDER_PLACED is
 * absent because checkout already sends its own confirmation.
 */
export const CUSTOMER_EMAIL_STATUSES: ReadonlySet<OrderStatus> = new Set([
    ...CUSTOMER_REASON_STATUSES,
    OrderStatus.DELIVERED,
]);
/** Vendors are emailed only when they must act: stop, hurry, or expect stock back. */
export const VENDOR_EMAIL_STATUSES: ReadonlySet<OrderStatus> = CUSTOMER_REASON_STATUSES;

/** The reason the customer should see for this status, or undefined if it is internal. */
export function customerFacingReason(
    status: OrderStatus,
    reason?: string | null,
): string | undefined {
    const trimmed = reason?.trim();
    return trimmed && CUSTOMER_REASON_STATUSES.has(status) ? trimmed : undefined;
}
