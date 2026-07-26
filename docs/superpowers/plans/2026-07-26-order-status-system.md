# Order Status System Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 8-value `OrderStatus` with a single unified 10-value status (`CREATED, CONFIRMED, PROCESSING, ARRIVED_AT_WAREHOUSE, DELAYED, ASSIGNED_TO_RIDER, DELIVERED, NOT_RECEIVED, CANCELLED, RETURNED`), enforce a real server-side permission matrix (admin/staff free-form any→any with mandatory reason; rider exactly 2 moves; vendor read-only), and route every status mutation through one audited, emailed, notified, socket-broadcast function.

**Architecture:** One new function `OrderService.changeOrderStatus()` becomes the only code path allowed to write `Order.status`. A small pure function `canTransition(role, from, to)` replaces the currently-unenforced `ORDER_STATUS_TRANSITIONS` map. `DeliveryStatus`, `delivery.admin.service.ts`, `delivery.rider.service.ts`, `delivery.service.ts`/`delivery.controller.ts` are **not restructured or deleted** — they keep managing their own `deliveryStatus` field exactly as today; the only change to them is that their 3 status-changing actions (`markAtWarehouse`, `assignRider`, `markDelivered`, `markDeliveryFailed`) additionally call `changeOrderStatus` so `Order.status` progresses and gets an audit/email/notification trail. `confirmPickup` stops writing `Order.status` (that field no longer has a "picked up" value) but is otherwise untouched.

**Tech Stack:** Node/Express/TypeORM/Postgres backend (`dajuvai-backend`), React/TypeScript frontend (`DajuVai_React/dajuvai-frontend`). No test framework is configured (`npm test` is a stub) — this repo's established convention is `ts-node`-run self-check scripts under `src/scripts/*.selfcheck.ts` using plain `assert` (see `fcm.selfcheck.ts`). Follow that pattern; do not introduce Jest/Mocha.

## Global Constraints

- `DeliveryStatus` enum/column and `delivery.service.ts`/`delivery.controller.ts`/`delivery.admin.service.ts`/`delivery.rider.service.ts` internals must NOT be deleted or restructured — confirmed instruction, the delivery module gets its own rebuild in a separate later task.
- Vendors get zero write access to order status — the vendor status-update route is removed outright (not just permission-gated), confirmed instruction.
- Riders get exactly 2 `Order.status` moves: `ASSIGNED_TO_RIDER → DELIVERED`, `ASSIGNED_TO_RIDER → NOT_RECEIVED` (reason required on the latter) — confirmed instruction.
- Admin/staff: any `Order.status` → any other, anytime, `reason` required (`note` optional) — confirmed instruction.
- Every `Order.status` write must go through `recordStatusChange` (audit log), never write `order.status`/`.save()` directly outside `changeOrderStatus`.
- No new npm dependencies. No new test framework. Verification = `npx tsc --noEmit` (backend) / `npm run build` (frontend) + one `ts-node` self-check script, matching house style.
- Never run destructive git operations; commit after each task per the repo's existing commit style (imperative, no ticket references).

---

### Task 1: Backend — unified status model, permission matrix, and `changeOrderStatus`

**Files:**
- Modify: `src/entities/order.entity.ts`
- Modify: `src/entities/orderVendorShipping.entity.ts`
- Modify: `src/entities/orderStatusHistory.entity.ts`
- Modify: `src/constants/orderStatus.constants.ts`
- Modify: `src/utils/zod_validations/order.zod.ts`
- Modify: `src/interface/order.interface.ts`
- Modify: `src/service/order.service.ts`
- Modify: `src/controllers/order.controller.ts`
- Modify: `src/routes/order.routes.ts`
- Modify: `src/utils/sanitize.util.ts`
- Modify: `src/utils/nodemailer.utils.ts`
- Modify: `src/socket/socket.ts`
- Modify: `src/service/delivery.admin.service.ts`
- Modify: `src/service/delivery.rider.service.ts`
- Modify: `src/service/delivery.service.ts` (dead file, kept — one line fixed so it still compiles)
- Modify: `src/utils/cronjob.utils.ts`
- Modify: `src/service/admin.vendors.service.ts`
- Modify: `src/service/admin.orders.service.ts`
- Modify: `src/service/vendor.orders.service.ts`
- Modify: `src/service/vendor.dashboard.service.ts`

**Interfaces:**
- Produces: `OrderStatus` enum (10 values, in `order.entity.ts`) — `CREATED, CONFIRMED, PROCESSING, ARRIVED_AT_WAREHOUSE, DELAYED, ASSIGNED_TO_RIDER, DELIVERED, NOT_RECEIVED, CANCELLED, RETURNED`.
- Produces: `canTransition(role: "ADMIN" | "RIDER" | "SYSTEM", from: OrderStatus, to: OrderStatus): boolean` in `src/constants/orderStatus.constants.ts`.
- Produces: `OrderService.changeOrderStatus(orderId: number, targetStatus: OrderStatus, options: { actorRole: "ADMIN" | "RIDER" | "SYSTEM"; changedByUserId?: number; reason: string; note?: string; expectedCurrentStatus?: OrderStatus }): Promise<SanitizedOrderFull>` — the only writer of `Order.status`.
- Produces: `emitOrderStatusUpdate(order: Order): void` in `src/socket/socket.ts`.
- Consumes (by Task 1 itself, from existing code): `sanitizeOrderFull`, `sendOrderStatusEmail`, `sendVendorOrderStatusEmail`, `NotificationService.notifyOrderStatusUpdated`, `recordStatusChange` (private, kept).

- [ ] **Step 1: Rewrite `OrderStatus` enum in `order.entity.ts`**

Replace lines 17-26 of `src/entities/order.entity.ts`:

```ts
export enum OrderStatus {
    PENDING = "PENDING",
    CONFIRMED = "CONFIRMED",
    PROCESSING = "PROCESSING",
    DELAYED = "DELAYED",
    SHIPPED = "SHIPPED",
    DELIVERED = "DELIVERED",
    CANCELLED = "CANCELLED",
    RETURNED = "RETURNED",
}
```

with:

```ts
export enum OrderStatus {
    CREATED = "CREATED",
    CONFIRMED = "CONFIRMED",
    PROCESSING = "PROCESSING",
    ARRIVED_AT_WAREHOUSE = "ARRIVED_AT_WAREHOUSE",
    DELAYED = "DELAYED",
    ASSIGNED_TO_RIDER = "ASSIGNED_TO_RIDER",
    DELIVERED = "DELIVERED",
    NOT_RECEIVED = "NOT_RECEIVED",
    CANCELLED = "CANCELLED",
    RETURNED = "RETURNED",
}
```

Also change the column default at line ~118 from `default: OrderStatus.CONFIRMED` to `default: OrderStatus.CREATED` — `CONFIRMED` as a default was already odd (a brand-new order defaulting to the entity's fallback, before `createOrderEntity` explicitly sets the real initial status, should read as "just created"):

```ts
    @Column({
        type: "enum",
        enum: OrderStatus,
        default: OrderStatus.CREATED,
    })
    status: OrderStatus;
```

`DeliveryStatus` enum and the `deliveryStatus` column (lines 41-50, 147-152) are **left untouched**.

- [ ] **Step 2: Remove `VendorOrderStatus` from `orderVendorShipping.entity.ts`**

Delete lines 20-43 of `src/entities/orderVendorShipping.entity.ts` (the `VendorOrderStatus` enum and `VENDOR_ORDER_STATUS_TRANSITIONS` map) and delete lines 94-99 (the `status` column):

```ts
  @Column({
    type: "enum",
    enum: VendorOrderStatus,
    default: VendorOrderStatus.CONFIRMED,
  })
  status: VendorOrderStatus;
```

The file's doc-comment (lines 14-19) mentions "Only the vendor that owns this row (or an admin) may change it" — update it to:

```ts
/**
 * A vendor's own fulfillment snapshot for their part of a (possibly
 * multi-vendor) order — distinct from Order.status (overall order
 * lifecycle, the single field admin/rider/customer/vendor all read).
 * Vendors are read-only: this row has no independently-writable status,
 * it only carries the per-vendor shipping/financial snapshot.
 */
```

- [ ] **Step 3: Add `RIDER` to `OrderStatusChangedByRole` in `orderStatusHistory.entity.ts`**

In `src/entities/orderStatusHistory.entity.ts`, change:

```ts
export enum OrderStatusChangedByRole {
    ADMIN = "ADMIN",
    VENDOR = "VENDOR",
    SYSTEM = "SYSTEM",
    CUSTOMER = "CUSTOMER",
}
```

to:

```ts
export enum OrderStatusChangedByRole {
    ADMIN = "ADMIN",
    VENDOR = "VENDOR",
    SYSTEM = "SYSTEM",
    CUSTOMER = "CUSTOMER",
    RIDER = "RIDER",
}
```

(`VENDOR` stays — historical rows already used it before vendors became read-only; it must remain a valid label so old history rows keep displaying correctly.)

- [ ] **Step 4: Rewrite `orderStatus.constants.ts` with the real permission matrix**

Replace the entire contents of `src/constants/orderStatus.constants.ts`:

```ts
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
```

- [ ] **Step 5: Update Zod validation in `order.zod.ts`**

In `src/utils/zod_validations/order.zod.ts`, remove the `VendorOrderStatus` import (line 4) and delete `updateVendorOrderStatusSchema` (lines 94-103). Replace `updateOrderStatusSchema` (lines 78-92):

```ts
/**
 * Schema for validating updates to order status.
 *
 * `reason` is now required — every admin/rider status change must be
 * attributable, not just optionally so. `note` stays optional for
 * additional free-text context.
 */
export const updateOrderStatusSchema = z.object({
    status: OrderStatusEnum,
    // Optimistic-concurrency guard: if provided and it no longer matches the
    // order's current status, the update is rejected with 409 instead of
    // silently overwriting a change another admin/rider/webhook just made.
    expectedCurrentStatus: OrderStatusEnum.optional(),
    reason: z.string().min(1, "Reason is required").max(500),
    note: z.string().max(1000).optional(),
});
```

- [ ] **Step 6: Update `order.interface.ts`**

In `src/interface/order.interface.ts`, delete `IUpdateVendorOrderStatusRequest` (lines 60-63... actually lines shown by the file dump — locate and delete the interface block). Change `IUpdateOrderStatusRequest` (lines 1412-1417):

```ts
export interface IUpdateOrderStatusRequest {
    status: OrderStatus;
    expectedCurrentStatus?: OrderStatus;
    reason: string;
    note?: string;
}
```

- [ ] **Step 7: Replace `updateOrderStatus`/`updateVendorOrderStatus`/`recordStatusChange` in `order.service.ts` with `changeOrderStatus`**

First, update the imports at the top of `src/service/order.service.ts`. Remove:

```ts
import {
    VendorOrderStatus,
    VENDOR_ORDER_STATUS_TRANSITIONS,
} from "../entities/orderVendorShipping.entity";
import { ORDER_STATUS_TRANSITIONS } from "../constants/orderStatus.constants";
```

Add:

```ts
import { canTransition, StatusActorRole } from "../constants/orderStatus.constants";
import { emitOrderStatusUpdate } from "../socket/socket";
```

Also remove the now-unused `sanitizeOrderForVendor` import if `updateVendorOrderStatus` was its only caller in this file — check with `grep -n sanitizeOrderForVendor src/service/order.service.ts` after this step; if only the deleted method used it, remove it from the import at the top.

Now replace the entire block from `updateOrderStatus` through the end of `updateVendorOrderStatus` (from the `/**\n * Update the status...` doc-comment before `updateOrderStatus` down to the closing `}` of `updateVendorOrderStatus`, i.e. lines ~2462-2721 as read) with:

```ts
    /**
     * The single function permitted to write Order.status anywhere in the
     * codebase. Every other status-changing code path — the admin/staff
     * free-form endpoint, delivery.admin.service.ts's markAtWarehouse/
     * assignRider, delivery.rider.service.ts's markDelivered/
     * markDeliveryFailed, payment webhooks — calls this instead of
     * assigning order.status directly, so the permission check, audit
     * log, customer/vendor emails, in-app notification, and socket push
     * always happen together and never drift out of sync again.
     */
    async changeOrderStatus(
        orderId: number,
        targetStatus: OrderStatus,
        options: {
            actorRole: StatusActorRole;
            changedByUserId?: number;
            reason: string;
            note?: string;
            expectedCurrentStatus?: OrderStatus;
        },
    ): Promise<SanitizedOrderFull> {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderedBy",
                "shippingAddress",
                "orderItems",
                "orderItems.product",
                "orderItems.vendor",
                "vendorShippings",
            ],
            withDeleted: true,
        });

        if (!order) {
            throw new APIError(404, "Order not found");
        }

        // Optimistic-concurrency guard: reject if the order moved since the
        // caller last read it (another admin, a rider, or a payment webhook).
        if (
            options.expectedCurrentStatus &&
            options.expectedCurrentStatus !== order.status
        ) {
            throw new OrderStateChangedError(
                `Order is currently ${order.status}, not ${options.expectedCurrentStatus}. Refresh and try again.`,
            );
        }

        const previousStatus = order.status;

        // Setting the same status again is a harmless no-op — match the
        // pre-existing behavior (frontend already disables the submit
        // button in this case) but skip every side effect below instead
        // of re-sending a "status changed" email/notification for
        // nothing changing.
        if (previousStatus === targetStatus) {
            return sanitizeOrderFull(order);
        }

        if (!canTransition(options.actorRole, previousStatus, targetStatus)) {
            throw new InvalidOrderStatusTransitionError(
                `${options.actorRole} cannot change order status from ${previousStatus} to ${targetStatus}.`,
            );
        }

        // COD orders are marked PAID the moment they're confirmed delivered.
        if (
            targetStatus === OrderStatus.DELIVERED &&
            order.paymentMethod === PaymentMethod.CASH_ON_DELIVERY &&
            order.paymentStatus !== PaymentStatus.PAID
        ) {
            order.paymentStatus = PaymentStatus.PAID;
        }

        // Restock whenever an order lands in a terminal not-fulfilled state,
        // unless it was already in one (avoid double-crediting stock if an
        // admin bounces between CANCELLED/NOT_RECEIVED/RETURNED).
        const terminalUnfulfilled = [
            OrderStatus.CANCELLED,
            OrderStatus.NOT_RECEIVED,
            OrderStatus.RETURNED,
        ];
        if (
            terminalUnfulfilled.includes(targetStatus) &&
            !terminalUnfulfilled.includes(previousStatus)
        ) {
            for (const item of order.orderItems) {
                if (item.variantId) {
                    const variant = await this.variantRepository.findOne({
                        where: { id: item.variantId },
                    });
                    if (variant) {
                        variant.stock += item.quantity;
                        variant.status = this.determineInventoryStatus(
                            variant.stock,
                        );
                        await this.variantRepository.save(variant);
                    }
                } else {
                    const product = await this.productRepository.findOne({
                        where: { id: item.productId },
                    });
                    if (product) {
                        product.stock += item.quantity;
                        product.status = this.determineInventoryStatus(
                            product.stock,
                        );
                        await this.productRepository.save(product);
                    }
                }
            }
        }

        order.status = targetStatus;
        await this.orderRepository.save(order);

        const changedByRole: OrderStatusChangedByRole =
            options.actorRole === "RIDER"
                ? OrderStatusChangedByRole.RIDER
                : options.actorRole === "SYSTEM"
                  ? OrderStatusChangedByRole.SYSTEM
                  : OrderStatusChangedByRole.ADMIN;

        await this.recordStatusChange(order.id, previousStatus, targetStatus, {
            reason: options.reason,
            note: options.note,
            changedByUserId: options.changedByUserId,
            changedByRole,
        });

        if (order.orderedBy?.email) {
            try {
                await sendOrderStatusEmail(
                    order.orderedBy.email,
                    order.orderNumber,
                    order.status,
                );
            } catch (error) {
                console.error("Failed to send customer status email:", error);
            }
        }

        // CREATED is covered by the order-placed email already sent at
        // checkout — every other transition gets a vendor notification.
        if (targetStatus !== OrderStatus.CREATED) {
            const vendorEmails = [
                ...new Set(
                    order.orderItems
                        .filter((item) => item.vendorId && item.vendor?.email)
                        .map((item) => item.vendor.email),
                ),
            ];

            await Promise.all(
                vendorEmails.map((email) =>
                    sendVendorOrderStatusEmail(
                        email,
                        order.orderNumber,
                        order.status,
                    ).catch((error) => {
                        console.error(
                            "Failed to send vendor status email:",
                            error,
                        );
                    }),
                ),
            );
        }

        try {
            await this.notificationService.notifyOrderStatusUpdated(order);
        } catch (error) {
            console.error("Failed to send order status notification:", error);
        }

        emitOrderStatusUpdate(order);

        return sanitizeOrderFull(order);
    }

    /** Appends one row to the order-status audit trail; no-ops when the
     * status didn't actually change. Every code path that mutates
     * Order.status (manual update, payment webhook, cancellation) must call
     * this instead of writing order_status_histories directly. */
    private async recordStatusChange(
        orderId: number,
        previousStatus: OrderStatus | null,
        newStatus: OrderStatus,
        options: {
            reason?: string;
            note?: string;
            changedByUserId?: number;
            changedByRole?: OrderStatusChangedByRole;
        } = {},
    ): Promise<void> {
        if (previousStatus === newStatus) return;

        await this.orderStatusHistoryRepository.save(
            this.orderStatusHistoryRepository.create({
                orderId,
                previousStatus,
                newStatus,
                changedByUserId: options.changedByUserId ?? null,
                changedByRole:
                    options.changedByRole ?? OrderStatusChangedByRole.SYSTEM,
                reason: options.reason ?? null,
                note: options.note ?? null,
            }),
        );
    }

    /**
     * Chronological status timeline for one order, for the order-details
     * "status history" panel.
     */
    async getOrderStatusHistory(
        orderId: number,
    ): Promise<OrderStatusHistory[]> {
        return this.orderStatusHistoryRepository.find({
            where: { orderId },
            relations: ["changedBy"],
            order: { createdAt: "ASC" },
        });
    }
```

Note: `handlePaymentCancel`, `esewaFailed`, `orderSuccess`, and `verifyPayment` (elsewhere in this file) call `recordStatusChange` directly today for their own internal (SYSTEM-role) transitions — leave those call sites as-is; they're narrow, hardcoded, trusted transitions that don't need the full `changeOrderStatus` pipeline (no reason field from a request body to validate, no permission check needed since the target is hardcoded). Only the two deleted admin/vendor-facing methods are being replaced.

Everywhere else in `order.service.ts`, replace `OrderStatus.PENDING` with `OrderStatus.CREATED` (the checkout default at line ~456):

```ts
            status:
                orderData.paymentMethod === PaymentMethod.CASH_ON_DELIVERY
                    ? OrderStatus.CONFIRMED
                    : OrderStatus.CREATED,
```

- [ ] **Step 8: Simplify `order.controller.ts`**

Replace `updateOrderStatus` (lines 452-481):

```ts
    async updateOrderStatus(
        req: AuthRequest<{ orderId: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const orderId = parseInt(req.params.orderId, 10);
        if (isNaN(orderId)) throw new BadRequestError("Invalid order ID");
        if (!req.user) throw new AuthError("User not authenticated");

        const { status, expectedCurrentStatus, reason, note } =
            req.body as IUpdateOrderStatusRequest;

        const updatedOrder = await this.orderService.changeOrderStatus(
            orderId,
            status,
            {
                actorRole: "ADMIN",
                changedByUserId: req.user.id,
                reason,
                note,
                expectedCurrentStatus,
            },
        );

        res.status(200).json({ success: true, data: updatedOrder });
    }
```

(`notificationService.notifyOrderStatusUpdated` is no longer called here — `changeOrderStatus` calls it internally now, for every caller, not just this one.)

Delete `updateVendorOrderStatus` entirely (the method, ~lines 598-620).

Remove the now-unused `IUpdateVendorOrderStatusRequest`, `VendorAuthRequest` (if `updateVendorOrderStatus` was its only use in this file — check with `grep -n VendorAuthRequest src/controllers/order.controller.ts`) from the import block.

- [ ] **Step 9: Update `order.routes.ts`**

Remove `updateVendorOrderStatusSchema` from the import (line ~149) and `isVendor`/`vendorAuthMiddleware` if unused elsewhere in the file after this change (check with grep first — both are almost certainly used by other vendor routes in this large file, so likely stay).

Delete the vendor status-update route entirely (~lines 1970-1976):

```ts
router.put(
    "/vendor/:orderId/status",
    vendorAuthMiddleware,
    isVendor,
    validateZod(updateVendorOrderStatusSchema),
    asyncHandler(orderController.updateVendorOrderStatus.bind(orderController)),
);
```

The admin status-update route (~1494-1500) and status-history route (~1501-1506) are unchanged.

- [ ] **Step 9b: Add a vendor-scoped status-history endpoint**

Today only `GET /api/order/admin/:orderId/status-history` exists (admin/staff-only) — vendors have no way to see the status timeline for their own orders. Since vendors are now permanently read-only, giving them visibility into *why* a status changed (the reason/note) is the read-only counterpart to that decision.

In `src/service/order.service.ts`, add a vendor-scoped wrapper right after `getOrderStatusHistory`:

```ts
    /**
     * Same timeline as getOrderStatusHistory, scoped to a vendor: throws if
     * the vendor has no items on this order, so a vendor can never read
     * another vendor's — or another customer's unrelated — order history.
     */
    async getOrderStatusHistoryForVendor(
        vendorId: number,
        orderId: number,
    ): Promise<OrderStatusHistory[]> {
        const hasAccess = await this.orderItemRepository.exists({
            where: { orderId, vendorId },
        });
        if (!hasAccess) {
            throw new APIError(
                404,
                "Order not found or you are not authorized to view it",
            );
        }
        return this.getOrderStatusHistory(orderId);
    }
```

In `src/controllers/order.controller.ts`, add a new method right after `getOrderStatusHistory`:

```ts
    async getVendorOrderStatusHistory(
        req: VendorAuthRequest<{ orderId: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        if (!req.vendor) throw new AuthError("Vendor not authenticated");

        const orderId = parseInt(req.params.orderId, 10);
        if (isNaN(orderId)) throw new BadRequestError("Invalid order ID");

        const history = await this.orderService.getOrderStatusHistoryForVendor(
            req.vendor.id,
            orderId,
        );
        res.status(200).json({ success: true, data: history });
    }
```

In `src/routes/order.routes.ts`, add a new route near the existing `GET /vendor/:orderId` route (~line 1965):

```ts
router.get(
    "/vendor/:orderId/status-history",
    vendorAuthMiddleware,
    isVendor,
    asyncHandler(orderController.getVendorOrderStatusHistory.bind(orderController)),
);
```

- [ ] **Step 10: Fix `sanitize.util.ts`**

In `src/utils/sanitize.util.ts`, remove the `fulfillmentStatus` line from `sanitizeOrderForVendor` (it read `OrderVendorShipping.status`, which no longer exists):

```ts
        ownShippingFee: ownShipping ? Number(ownShipping.shippingFee) : null,
        ownShippingZone: ownShipping?.shippingZone ?? null,
        fulfillmentStatus: ownShipping?.status ?? null,
    };
```

becomes:

```ts
        ownShippingFee: ownShipping ? Number(ownShipping.shippingFee) : null,
        ownShippingZone: ownShipping?.shippingZone ?? null,
    };
```

Also remove `fulfillmentStatus` from the `SanitizedVendorOrderView` type definition (search for it near the top of the file, same file, the interface that `sanitizeOrderForVendor`'s return type refers to).

- [ ] **Step 11: Add email metadata for the 4 new/renamed statuses in `nodemailer.utils.ts`**

In `getOrderStatusEmailMeta` (`src/utils/nodemailer.utils.ts`), replace the `PENDING` entry and add 3 new entries. Change:

```ts
        PENDING: {
            label: "Pending",
            color: "#92400e",
            bg: "#fef3c7",
            copy: "We have received your order and are waiting for confirmation.",
        },
```

to:

```ts
        CREATED: {
            label: "Order Placed",
            color: "#92400e",
            bg: "#fef3c7",
            copy: "We have received your order and are waiting for confirmation.",
        },
```

Replace the `SHIPPED` entry:

```ts
        SHIPPED: {
            label: "Shipped",
            color: "#0369a1",
            bg: "#e0f2fe",
            copy: "Your order has been handed to delivery and is on the way.",
        },
```

with:

```ts
        ARRIVED_AT_WAREHOUSE: {
            label: "At Warehouse",
            color: "#7c3aed",
            bg: "#ede9fe",
            copy: "Your order has arrived at our warehouse and is being prepared for delivery.",
        },
        ASSIGNED_TO_RIDER: {
            label: "Out for Delivery",
            color: "#0369a1",
            bg: "#e0f2fe",
            copy: "Your order has been handed to a delivery rider and is on the way.",
        },
```

And add a `NOT_RECEIVED` entry right after `DELIVERED`:

```ts
        NOT_RECEIVED: {
            label: "Not Received",
            color: "#b45309",
            bg: "#fef3c7",
            copy: "We were unable to deliver your order. Our team will reach out shortly to reschedule.",
        },
```

Do the identical 4-entry edit (same labels/colors/bg, vendor-appropriate copy) in `getVendorOrderStatusEmailMeta` — it currently only has `CANCELLED/DELAYED/DELIVERED/RETURNED`; add:

```ts
        CREATED: {
            label: "Order Placed",
            color: "#92400e",
            bg: "#fef3c7",
            copy: "A new order has been placed for one of your products.",
        },
        PROCESSING: {
            label: "Processing",
            color: "#6d28d9",
            bg: "#ede9fe",
            copy: "This order is being prepared. Please ensure it is packed and ready for pickup.",
        },
        ARRIVED_AT_WAREHOUSE: {
            label: "At Warehouse",
            color: "#7c3aed",
            bg: "#ede9fe",
            copy: "This order has arrived at the warehouse.",
        },
        ASSIGNED_TO_RIDER: {
            label: "Out for Delivery",
            color: "#0369a1",
            bg: "#e0f2fe",
            copy: "This order has been handed to a delivery rider.",
        },
        NOT_RECEIVED: {
            label: "Not Received",
            color: "#b45309",
            bg: "#fef3c7",
            copy: "The customer did not receive this order. Please check your dashboard for details.",
        },
```

(`CONFIRMED` has no vendor-email entry today either — leave that gap as-is, it's pre-existing and out of scope; the fallback branch already covers any status without a dedicated entry.)

- [ ] **Step 12: Add the socket emit in `socket.ts`**

At the bottom of `src/socket/socket.ts`, after `emitCommissionDelete`, add:

```ts
// Pushes a live status update to the customer and every vendor on the
// order the moment Order.status changes — closes the gap where status
// changes only ever reached clients via poll/refresh/email.
export const emitOrderStatusUpdate = (order: Order) => {
    if (!io) return;
    const payload = {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
    };
    io.to(userRoom(order.orderedById)).emit("order:statusUpdated", payload);

    const vendorIds = [
        ...new Set((order.orderItems ?? []).map((item) => item.vendorId)),
    ];
    for (const vendorId of vendorIds) {
        io.to(vendorRoom(vendorId)).emit("order:statusUpdated", payload);
    }
};
```

Add `Order` to the existing `import { Order } from "../entities/order.entity";` — actually this file doesn't import `Order` yet; add:

```ts
import { Order } from "../entities/order.entity";
```

to the top import block (alongside the existing `User`/`Vendor`/`Cart`/`CommissionDocument` imports).

- [ ] **Step 13: Wire `delivery.admin.service.ts` into `changeOrderStatus`**

In `src/service/delivery.admin.service.ts`, add an `OrderService` instance and constructor wiring:

```ts
import { OrderService } from "./order.service";
```

```ts
    private orderService: OrderService;
```

```ts
        this.orderService = new OrderService();
```

(add these alongside the existing repository fields/constructor lines).

Update `markAtWarehouse`:

```ts
    async markAtWarehouse(orderId: number) {
        const order = await this.findOrderById(orderId);

        this.validateAndTransition(order, DeliveryStatus.AT_WAREHOUSE);
        await this.orderRepository.save(order);

        await this.orderService.changeOrderStatus(
            orderId,
            OrderStatus.ARRIVED_AT_WAREHOUSE,
            {
                actorRole: "SYSTEM",
                reason: "Order arrived at warehouse",
            },
        );

        return sanitizeOrderForDelivery(order);
    }
```

Update `assignRider`:

```ts
    async assignRider(orderId: number, data: AssignRiderType) {
        const order = await this.findOrderById(orderId);

        const rider = await this.riderRepository.findOne({
            where: { id: data.riderId },
        });
        if (!rider) throw new APIError(404, "rider not found");

        if (
            order.deliveryStatus !== DeliveryStatus.READY_FOR_DELIVERY &&
            order.deliveryStatus !== DeliveryStatus.AT_WAREHOUSE
        ) {
            throw new APIError(
                400,
                "Order is not ready for delivery assignment",
            );
        }

        const existingAssignment = await this.assignmentRepository.findOne({
            where: { orderId },
            order: { createdAt: "DESC" },
        });

        if (
            existingAssignment &&
            ![AssignmentStatus.DELIVERED, AssignmentStatus.FAILED].includes(
                existingAssignment.assignmentStatus,
            )
        ) {
            throw new APIError(
                400,
                "Order already has an active rider assigned",
            );
        }

        const savedAssignment = await AppDataSource.transaction(
            async (manager) => {
                const assignment = manager.create(DeliveryAssignment, {
                    orderId,
                    riderId: data.riderId,
                });

                const saved = await manager.save(assignment);

                this.validateAndTransition(order, DeliveryStatus.RIDER_ASSIGNED);
                await manager.save(order);

                return saved;
            },
        );

        await this.orderService.changeOrderStatus(
            orderId,
            OrderStatus.ASSIGNED_TO_RIDER,
            {
                actorRole: "SYSTEM",
                reason: `Assigned to rider ${rider.fullName}`,
            },
        );

        return savedAssignment;
    }
```

`backToWarehouse` currently sets `order.status = OrderStatus.RETURNED` directly, bypassing the audit log — route it through `changeOrderStatus` instead:

```ts
    async backToWarehouse(orderId: number) {
        const order = await this.findOrderById(orderId);

        this.validateAndTransition(order, DeliveryStatus.AT_WAREHOUSE);
        await this.orderRepository.save(order);

        const updated = await this.orderService.changeOrderStatus(
            orderId,
            OrderStatus.RETURNED,
            {
                actorRole: "SYSTEM",
                reason: "Order returned to warehouse",
            },
        );

        return sanitizeOrderForDelivery(order);
    }
```

(`updated` is unused here on purpose — `sanitizeOrderForDelivery` needs the delivery-shaped `order` object, not `changeOrderStatus`'s `SanitizedOrderFull`; the call is only for its side effects. Prefix with `void` instead of assigning if the linter complains about an unused variable: `await this.orderService.changeOrderStatus(...)` with no assignment at all is simpler — use that form.)

Also fix the two `OrderStatus.PENDING`/`OrderStatus.SHIPPED` references check — `grep -n "OrderStatus\." src/service/delivery.admin.service.ts` to confirm none remain unaddressed (this file's only direct `Order.status` write was in `backToWarehouse`, now fixed above).

- [ ] **Step 14: Wire `delivery.rider.service.ts` into `changeOrderStatus`, drop the pickup status write**

In `src/service/delivery.rider.service.ts`, add the same `OrderService` wiring (import, field, constructor line) as Step 13.

In `confirmPickup`, remove the line that writes the now-nonexistent `OrderStatus.SHIPPED` — pickup no longer changes `Order.status` at all (only `deliveryStatus`, which this method already handles and which this task does not touch):

```ts
        return await AppDataSource.transaction(async (manager) => {
            this.adminService.validateAndTransition(order, DeliveryStatus.OUT_FOR_DELIVERY);
            await manager.save(order);

            assignment.assignmentStatus = AssignmentStatus.PICKED_UP;
            assignment.pickedUpAt = new Date();
            await manager.save(assignment);

            const rider = await manager.findOne(Rider, { where: { id: riderId } });
            if (rider) {
                rider.onDelivery = true;
                await manager.save(rider);
            }

            return assignment;
        });
```

(only the `order.status = OrderStatus.SHIPPED;` line is deleted — everything else in `confirmPickup` is unchanged.)

In `markDelivered`, add the `changeOrderStatus` call after the existing transaction (rider is the actor, target is `DELIVERED`):

```ts
    async markDelivered(orderId: number, riderId: number) {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
        });
        if (!order) throw new APIError(404, "Order not found");

        const assignment = await this.assignmentRepository.findOne({
            where: {
                orderId,
                riderId,
                assignmentStatus: AssignmentStatus.PICKED_UP,
            },
            order: { createdAt: "DESC" },
        });
        if (!assignment) {
            throw new APIError(
                404,
                "this rider was not assigned to this order or was not picked up",
            );
        }

        const updatedAssignment = await AppDataSource.transaction(
            async (manager) => {
                this.adminService.validateAndTransition(order, DeliveryStatus.DELIVERED);
                await manager.save(order);

                assignment.assignmentStatus = AssignmentStatus.DELIVERED;
                assignment.deliveredAt = new Date();
                await manager.save(assignment);

                const rider = await manager.findOne(Rider, { where: { id: riderId } });
                if (rider) {
                    rider.onDelivery = false;
                    await manager.save(rider);
                }

                return assignment;
            },
        );

        await this.orderService.changeOrderStatus(orderId, OrderStatus.DELIVERED, {
            actorRole: "RIDER",
            changedByUserId: riderId,
            reason: "Delivered by rider",
        });

        return updatedAssignment;
    }
```

In `markDeliveryFailed`, add the equivalent `changeOrderStatus` call targeting `NOT_RECEIVED`, using `data.failedReason` as the reason (this closes the exact gap the audit found: today this path never touches `Order.status` or the history log at all):

```ts
    async markDeliveryFailed(
        orderId: number,
        riderId: number,
        data: DeliveryFailedType,
    ) {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
        });
        if (!order) throw new APIError(404, "Order not found");

        const assignment = await this.assignmentRepository.findOne({
            where: {
                orderId,
                riderId,
                assignmentStatus: AssignmentStatus.PICKED_UP,
            },
            order: { createdAt: "DESC" },
        });
        if (!assignment) {
            throw new APIError(
                404,
                "no active pickup found for this rider and order",
            );
        }

        const updatedAssignment = await AppDataSource.transaction(
            async (manager) => {
                this.adminService.validateAndTransition(order, DeliveryStatus.DELIVERY_FAILED);
                await manager.save(order);

                assignment.assignmentStatus = AssignmentStatus.FAILED;
                assignment.failureReason = data.failedReason;
                await manager.save(assignment);

                const rider = await manager.findOne(Rider, { where: { id: riderId } });
                if (rider) {
                    rider.onDelivery = false;
                    await manager.save(rider);
                }

                return assignment;
            },
        );

        await this.orderService.changeOrderStatus(
            orderId,
            OrderStatus.NOT_RECEIVED,
            {
                actorRole: "RIDER",
                changedByUserId: riderId,
                reason: data.failedReason,
            },
        );

        return updatedAssignment;
    }
```

`getRiderAssignments` is unchanged.

- [ ] **Step 15: Fix the dead `delivery.service.ts` so it still compiles**

`src/service/delivery.service.ts` is confirmed dead (unwired, nothing imports it except its own controller, which is also unwired) — per instruction it is kept, not deleted, but it still references the now-removed `OrderStatus.SHIPPED` at line 396 and would fail `tsc`. Apply the same minimal fix as Step 14: delete just the `order.status = OrderStatus.SHIPPED;` line in its `confirmPickup`-equivalent method, leaving everything else in the file untouched. Do not add a `changeOrderStatus` call here — this file is dead code, not part of the live request path.

- [ ] **Step 16: Mechanical `OrderStatus.PENDING`/`OrderStatus.SHIPPED` renames in stats/cron files**

These files only ever read `Order.status` for counting/filtering — rename the two removed enum members to their direct replacements, no other logic changes:

`src/utils/cronjob.utils.ts` line 164:
```ts
                    status: OrderStatus.PENDING,
```
→
```ts
                    status: OrderStatus.CREATED,
```

`src/service/admin.vendors.service.ts` line 80:
```ts
                statuses: [OrderStatus.DELIVERED, OrderStatus.CONFIRMED, OrderStatus.SHIPPED],
```
→
```ts
                statuses: [OrderStatus.DELIVERED, OrderStatus.CONFIRMED, OrderStatus.ASSIGNED_TO_RIDER],
```

`src/service/admin.orders.service.ts` lines 42-48 (also update the doc-comment on line 41-42):
```ts
    /**
     * Count in-flight orders: PENDING, SHIPPED, CONFIRMED.
     */
    async getProcessingOrdersCount(): Promise<number> {
        return this.orderRepository
            .createQueryBuilder('order')
            .where('order.status IN (:...statuses)', {
                statuses: [OrderStatus.PENDING, OrderStatus.SHIPPED],
            })
            .getCount();
    }
```
→
```ts
    /**
     * Count in-flight orders: CREATED, ASSIGNED_TO_RIDER.
     */
    async getProcessingOrdersCount(): Promise<number> {
        return this.orderRepository
            .createQueryBuilder('order')
            .where('order.status IN (:...statuses)', {
                statuses: [OrderStatus.CREATED, OrderStatus.ASSIGNED_TO_RIDER],
            })
            .getCount();
    }
```

`src/service/vendor.orders.service.ts` lines 24-34 (`getNeedingFulfillmentCount`) and lines 36-46 (`getInDeliveryCount`), including their doc-comments:
```ts
    /**
     * Count order items for this vendor where the parent order is PENDING.
     */
    async getNeedingFulfillmentCount(vendorId: number): Promise<number> {
        return this.orderItemRepository
            .createQueryBuilder('oi')
            .innerJoin('oi.order', 'order')
            .where('oi.vendorId = :vendorId', { vendorId })
            .andWhere('order.status = :status', { status: OrderStatus.PENDING })
            .getCount();
    }

    /**
     * Count order items for this vendor where the parent order is SHIPPED or OUT_FOR_DELIVERY.
     */
    async getInDeliveryCount(vendorId: number): Promise<number> {
        return this.orderItemRepository
            .createQueryBuilder('oi')
            .innerJoin('oi.order', 'order')
            .where('oi.vendorId = :vendorId', { vendorId })
            .andWhere('order.status = :status', { status: OrderStatus.SHIPPED })
            .getCount();
    }
```
→
```ts
    /**
     * Count order items for this vendor where the parent order is CREATED.
     */
    async getNeedingFulfillmentCount(vendorId: number): Promise<number> {
        return this.orderItemRepository
            .createQueryBuilder('oi')
            .innerJoin('oi.order', 'order')
            .where('oi.vendorId = :vendorId', { vendorId })
            .andWhere('order.status = :status', { status: OrderStatus.CREATED })
            .getCount();
    }

    /**
     * Count order items for this vendor where the parent order is ASSIGNED_TO_RIDER.
     */
    async getInDeliveryCount(vendorId: number): Promise<number> {
        return this.orderItemRepository
            .createQueryBuilder('oi')
            .innerJoin('oi.order', 'order')
            .where('oi.vendorId = :vendorId', { vendorId })
            .andWhere('order.status = :status', { status: OrderStatus.ASSIGNED_TO_RIDER })
            .getCount();
    }
```

`src/service/vendor.dashboard.service.ts` — **note a separate pre-existing bug this surfaces**: line 2 imports `OrderStatus` from the wrong module —

```ts
import { OrderItem, OrderStatus } from "../entities/orderItems.entity";
```

`orderItems.entity.ts` has its own long-dead, entirely-unused `OrderStatus` enum (declared, never applied to any column, never referenced elsewhere) that happens to share member names with the real one — this file has been comparing `order.status` against the *wrong* enum's values the whole time, only "working" because the string values happened to coincide (`"PENDING"`, `"DELIVERED"`, `"CONFIRMED"`). Since the dead enum has no `CREATED` member, this must be fixed by pointing the import at the real enum, not just renaming the member. Change the import to:

```ts
import { OrderItem } from "../entities/orderItems.entity";
import { OrderStatus } from "../entities/order.entity";
```

Then update both usages in this file — line 53:
```ts
            .andWhere('order.status = :status', { status: OrderStatus.PENDING })
```
→
```ts
            .andWhere('order.status = :status', { status: OrderStatus.CREATED })
```

and line 155 (`statuses: [OrderStatus.DELIVERED, OrderStatus.CONFIRMED]`) needs no value change — `DELIVERED`/`CONFIRMED` exist identically on the real enum — but now resolves to the correct type instead of the dead one.

(`orderItems.entity.ts`'s own dead `OrderStatus` enum, lines 14-21, is left alone — it's unused after this fix, harmless, and touching an entity file's dead export is unrelated cleanup outside this task's scope.)

- [ ] **Step 16b: Fix the two raw-string `"PENDING"` comparisons in `order.service.ts`'s vendor order list**

These are in `getVendorOrders` (the vendor order-list tab filter/counts) and use bare string literals, not `OrderStatus.PENDING` — `grep -n "OrderStatus\."` would not have caught them, only a plain string search does. In `src/service/order.service.ts`:

Line ~2789 (the frontend-tab-to-DB-value map):
```ts
            const statusMap: Record<string, string> = {
                delivered: "DELIVERED",
                pending: "PENDING",
                canceled: "CANCELLED",
                cancelled: "CANCELLED",
            };
```
→
```ts
            const statusMap: Record<string, string> = {
                delivered: "DELIVERED",
                pending: "CREATED",
                canceled: "CANCELLED",
                cancelled: "CANCELLED",
            };
```

Line ~2841 (the status-counts aggregation):
```ts
                if (s === "DELIVERED") statusCounts.delivered += n;
                else if (s === "PENDING") statusCounts.pending += n;
                else if (s === "CANCELLED" || s === "CANCELED" || s === "RETURNED") statusCounts.canceled += n;
```
→
```ts
                if (s === "DELIVERED") statusCounts.delivered += n;
                else if (s === "CREATED") statusCounts.pending += n;
                else if (s === "CANCELLED" || s === "CANCELED" || s === "RETURNED" || s === "NOT_RECEIVED") statusCounts.canceled += n;
```

(`NOT_RECEIVED` is added to the "canceled" bucket here since it's the closest existing tab-count category a failed delivery belongs in — this vendor-facing tab UI only has 4 buckets (all/pending/delivered/canceled), and this task doesn't add a 5th; grouping "not received" under the existing "canceled" tab is the minimal correct fix, not a redesign of the vendor tab UI.)

The `IVendorStatusCounts` type/labels themselves (`pending`/`delivered`/`canceled` field names) are unchanged — only the DB-value strings they're populated from.

- [ ] **Step 16c: Update stale Swagger `"PENDING"` example values in `order.routes.ts`**

These are JSDoc `@swagger` comment example values only (cosmetic API documentation, not executable code) — run a single find-and-replace rather than editing each by hand:

```bash
sed -i 's/example: "PENDING"/example: "CREATED"/g' src/routes/order.routes.ts
```

Verify with `grep -n 'example: "PENDING"' src/routes/order.routes.ts` — expect no output.

- [ ] **Step 17: Compile check**

Run:
```bash
npx tsc --noEmit
```
Expected: no errors. If any remain, they will name the exact file/line still referencing a removed `OrderStatus`/`VendorOrderStatus` member — fix each one the same way as Steps 15-16 (this is why `tsc` is the verification tool for this task: an enum-member removal makes every stale reference a compile error, so a clean compile is proof every call site was found).

- [ ] **Step 18: Commit**

```bash
git add src/entities/order.entity.ts src/entities/orderVendorShipping.entity.ts src/entities/orderStatusHistory.entity.ts src/constants/orderStatus.constants.ts src/utils/zod_validations/order.zod.ts src/interface/order.interface.ts src/service/order.service.ts src/controllers/order.controller.ts src/routes/order.routes.ts src/utils/sanitize.util.ts src/utils/nodemailer.utils.ts src/socket/socket.ts src/service/delivery.admin.service.ts src/service/delivery.rider.service.ts src/service/delivery.service.ts src/utils/cronjob.utils.ts src/service/admin.vendors.service.ts src/service/admin.orders.service.ts src/service/vendor.orders.service.ts src/service/vendor.dashboard.service.ts
git commit -m "feat: unify order status into one 10-value enum with a real permission matrix

Replaces OrderStatus (8 values) + the unenforced ORDER_STATUS_TRANSITIONS
map with a 10-value enum and canTransition(role, from, to): admin/staff
free-form any-to-any with mandatory reason, rider exactly 2 moves
(ASSIGNED_TO_RIDER -> DELIVERED/NOT_RECEIVED), vendor read-only. All
status writes now route through OrderService.changeOrderStatus, closing
the audit-log/email/notification gap that previously let rider and
warehouse actions bypass them entirely. DeliveryStatus and the delivery
module are intentionally left untouched (separate future task)."
```

---

### Task 2: Backend — database migration

**Files:**
- Create: `src/migrations/1785000000001-order-status-add-new-values.ts`
- Create: `src/migrations/1785000000002-order-status-backfill-and-drop-vendor-status.ts`

**Interfaces:**
- Consumes: Postgres enum types `orders_status_enum`, `order_status_histories_changedbyrole_enum` (both already exist from prior migrations, per `src/migrations/1784455956678-order-status-processing-and-history.ts`).
- Produces: `orders.status` column values fully migrated to the 10 new labels; `order_vendor_shippings.status` column dropped.

Postgres cannot use a newly-added enum label in the same transaction it was added in (`ALTER TYPE ... ADD VALUE` commits are transaction-boundary-sensitive) — this must be 2 separate migration files so TypeORM runs them in 2 separate transactions, matching this repo's existing `migrationsTransactionMode` (each file = one transaction, evidenced by the single prior migration file wrapping its own `up()` atomically).

- [ ] **Step 1: Write the enum-values-only migration**

Create `src/migrations/1785000000001-order-status-add-new-values.ts`:

```ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderStatusAddNewValues1785000000001 implements MigrationInterface {
    name = 'OrderStatusAddNewValues1785000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // New unified-status labels. Postgres enum values can only be added,
        // never renamed/removed in place — PENDING and SHIPPED are left as
        // permanently-unused labels on the type rather than attempting a
        // full type rebuild, matching the precedent set by the migration
        // that first added PROCESSING (1784455956678).
        await queryRunner.query(`ALTER TYPE "public"."orders_status_enum" ADD VALUE IF NOT EXISTS 'CREATED'`);
        await queryRunner.query(`ALTER TYPE "public"."orders_status_enum" ADD VALUE IF NOT EXISTS 'ARRIVED_AT_WAREHOUSE'`);
        await queryRunner.query(`ALTER TYPE "public"."orders_status_enum" ADD VALUE IF NOT EXISTS 'ASSIGNED_TO_RIDER'`);
        await queryRunner.query(`ALTER TYPE "public"."orders_status_enum" ADD VALUE IF NOT EXISTS 'NOT_RECEIVED'`);

        // Riders now write order_status_histories rows directly (previously
        // their actions bypassed the audit log entirely) — the
        // changedByRole enum needs a value for them.
        await queryRunner.query(`ALTER TYPE "public"."order_status_histories_changedbyrole_enum" ADD VALUE IF NOT EXISTS 'RIDER'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Postgres cannot remove a single enum value without rebuilding the
        // type; not automated here (would fail if any row already uses one
        // of these values) — matching the precedent in 1784455956678.
    }
}
```

- [ ] **Step 2: Write the backfill + vendor-status-drop migration**

Create `src/migrations/1785000000002-order-status-backfill-and-drop-vendor-status.ts`:

```ts
import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderStatusBackfillAndDropVendorStatus1785000000002 implements MigrationInterface {
    name = 'OrderStatusBackfillAndDropVendorStatus1785000000002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── Backfill existing rows onto the new unified status values ──────
        // Must run in a later migration (later transaction) than the one that
        // added these enum labels — Postgres forbids using a brand-new enum
        // value inside the same transaction that created it.

        // PENDING was the "just placed, unpaid/COD-unconfirmed" state.
        await queryRunner.query(`UPDATE "orders" SET "status" = 'CREATED' WHERE "status" = 'PENDING'`);

        // SHIPPED only ever meant "handed to a rider" in the old model
        // (order.service.ts and delivery.rider.service.ts both only ever
        // set status=SHIPPED for that exact stage) — no deliveryStatus
        // filter needed, every SHIPPED row already implies rider-assigned.
        await queryRunner.query(`UPDATE "orders" SET "status" = 'ASSIGNED_TO_RIDER' WHERE "status" = 'SHIPPED'`);

        // PROCESSING/DELAYED rows that had progressed further in the
        // deliveryStatus lifecycle (reached the warehouse) get bumped to
        // the new coarse-grained ARRIVED_AT_WAREHOUSE value; rows still at
        // deliveryStatus=order_processing stay PROCESSING/DELAYED as-is.
        await queryRunner.query(`
            UPDATE "orders" SET "status" = 'ARRIVED_AT_WAREHOUSE'
            WHERE "status" IN ('PROCESSING', 'DELAYED')
              AND "deliveryStatus" IN ('at_warehouse', 'ready_for_delivery')
        `);

        // deliveryStatus=delivery_failed is set by two different paths:
        // a real courier delivery failure (order.status was ASSIGNED_TO_RIDER
        // by now, from the update above) and a payment-gateway failure
        // (esewaFailed/verifyPayment, which always also sets status=CANCELLED
        // in the same write). The CANCELLED guard keeps payment failures
        // correctly excluded — only true delivery failures get NOT_RECEIVED.
        await queryRunner.query(`
            UPDATE "orders" SET "status" = 'NOT_RECEIVED'
            WHERE "deliveryStatus" = 'delivery_failed'
              AND "status" != 'CANCELLED'
        `);

        // RETURNED_WAREHOUSE is defined on DeliveryStatus but nothing in the
        // current codebase ever sets it — defensive backfill in case any
        // row somehow has it, harmless no-op otherwise.
        await queryRunner.query(`
            UPDATE "orders" SET "status" = 'RETURNED'
            WHERE "deliveryStatus" = 'returned_warehouse'
              AND "status" != 'CANCELLED'
        `);

        // ── Vendors are read-only now — drop their per-vendor status column ──
        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" DROP COLUMN "status"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" ADD "status" "public"."orders_status_enum" NOT NULL DEFAULT 'CONFIRMED'`);
        // The status backfill is not reversed — same precedent as
        // 1784455956678's backfilled history rows, which also aren't
        // undone on down(). Re-deriving the exact prior (status,
        // deliveryStatus) pair per row is not attempted.
    }
}
```

- [ ] **Step 3: Run the migrations against the dev database**

```bash
npm run migration:run
```

Expected: both migrations report as executed, no errors. If the dev database has no rows in `PENDING`/`SHIPPED`/etc. yet, the `UPDATE` statements simply affect 0 rows — still a valid, successful run.

- [ ] **Step 4: Spot-check the backfill**

Run this ad-hoc query (via `psql` or a DB GUI) to confirm no order is left on a stale/removed status label:

```sql
SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY status;
```

Expected: `PENDING` and `SHIPPED` show 0 rows (or don't appear at all); every row's `status` is one of the 10 new values.

- [ ] **Step 5: Commit**

```bash
git add src/migrations/1785000000001-order-status-add-new-values.ts src/migrations/1785000000002-order-status-backfill-and-drop-vendor-status.ts
git commit -m "feat: migrate orders to the unified 10-value status and drop vendor status column"
```

---

### Task 3: Backend — self-check script

**Files:**
- Create: `src/scripts/orderStatus.selfcheck.ts`
- Modify: `package.json` (add `check:orderstatus` script)

**Interfaces:**
- Consumes: `canTransition` from `src/constants/orderStatus.constants.ts`, `updateOrderStatusSchema` from `src/utils/zod_validations/order.zod.ts`, `getOrderStatusEmailMeta`/`getVendorOrderStatusEmailMeta` are not exported (module-private) — instead this script asserts email-meta completeness indirectly via `sendOrderStatusEmail`/`sendVendorOrderStatusEmail`'s observable behavior is impractical without a live SMTP mock, so this script tests `canTransition` and the Zod schema directly (the two pure, easily-testable pieces), plus a regression guard on stale enum references.

- [ ] **Step 1: Write the self-check script**

Create `src/scripts/orderStatus.selfcheck.ts`:

```ts
/**
 * Self-check for the unified order-status permission matrix. No DB, no
 * network, no test framework.
 *
 *   npx ts-node src/scripts/orderStatus.selfcheck.ts
 *
 * Covers canTransition()'s 3 actor roles and the updateOrderStatusSchema's
 * now-required reason field — the two places a bug here would silently
 * let an unauthorized status change through, or silently accept a
 * status change with no audit reason.
 */
import assert from "assert";
import { readFileSync } from "fs";
import { readdirSync } from "fs";
import { join } from "path";
import { canTransition } from "../constants/orderStatus.constants";
import { OrderStatus } from "../entities/order.entity";
import { updateOrderStatusSchema } from "../utils/zod_validations/order.zod";

const ok = (name: string) => console.log(`  ok - ${name}`);

function checkAdminIsFreeForm() {
    // Every (from, to) pair where from !== to must be allowed for ADMIN —
    // that's the entire point of the free-form redesign.
    const statuses = Object.values(OrderStatus);
    let checked = 0;
    for (const from of statuses) {
        for (const to of statuses) {
            if (from === to) continue;
            assert.ok(
                canTransition("ADMIN", from, to),
                `admin must be able to move ${from} -> ${to}`,
            );
            checked++;
        }
    }
    assert.strictEqual(checked, statuses.length * (statuses.length - 1));
    ok(`admin can move between all ${checked} (from, to) pairs`);
}

function checkSystemIsFreeForm() {
    assert.ok(
        canTransition("SYSTEM", OrderStatus.CREATED, OrderStatus.CANCELLED),
        "system must be free-form too (internal webhook transitions)",
    );
    ok("system role is free-form");
}

function checkRiderIsRestrictedToTwoMoves() {
    assert.ok(
        canTransition("RIDER", OrderStatus.ASSIGNED_TO_RIDER, OrderStatus.DELIVERED),
        "rider must be able to mark DELIVERED",
    );
    assert.ok(
        canTransition("RIDER", OrderStatus.ASSIGNED_TO_RIDER, OrderStatus.NOT_RECEIVED),
        "rider must be able to mark NOT_RECEIVED",
    );

    const statuses = Object.values(OrderStatus);
    let disallowed = 0;
    for (const from of statuses) {
        for (const to of statuses) {
            if (from === to) continue;
            const isOneOfTheTwoAllowedMoves =
                from === OrderStatus.ASSIGNED_TO_RIDER &&
                (to === OrderStatus.DELIVERED || to === OrderStatus.NOT_RECEIVED);
            if (isOneOfTheTwoAllowedMoves) continue;

            assert.strictEqual(
                canTransition("RIDER", from, to),
                false,
                `rider must NOT be able to move ${from} -> ${to}`,
            );
            disallowed++;
        }
    }
    assert.ok(disallowed > 0);
    ok(`rider is blocked on all ${disallowed} other (from, to) pairs`);
}

async function checkReasonIsRequired() {
    await assert.rejects(
        () =>
            updateOrderStatusSchema.parseAsync({
                status: "CANCELLED",
                reason: "",
            }),
        "empty reason must be rejected",
    );
    await assert.rejects(
        () => updateOrderStatusSchema.parseAsync({ status: "CANCELLED" }),
        "missing reason must be rejected",
    );
    const parsed = await updateOrderStatusSchema.parseAsync({
        status: "CANCELLED",
        reason: "Customer requested cancellation",
    });
    assert.strictEqual(parsed.reason, "Customer requested cancellation");
    ok("updateOrderStatusSchema requires a non-empty reason");
}

/**
 * Regression guard: removed enum members must not silently creep back in
 * via a copy-pasted string literal anywhere in src/.
 */
function checkNoStaleEnumReferences() {
    const staleTokens = ["OrderStatus.PENDING", "OrderStatus.SHIPPED", "VendorOrderStatus"];
    const srcDir = join(__dirname, "..");
    let filesChecked = 0;

    const walk = (dir: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const full = join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(full);
                continue;
            }
            if (!entry.name.endsWith(".ts")) continue;
            const content = readFileSync(full, "utf8");
            for (const token of staleTokens) {
                assert.ok(
                    !content.includes(token),
                    `${full} still references removed ${token}`,
                );
            }
            filesChecked++;
        }
    };

    walk(srcDir);
    assert.ok(filesChecked > 50, `expected to scan >50 files, saw ${filesChecked}`);
    ok(`no stale enum references across ${filesChecked} source files`);
}

(async () => {
    console.log("order status self-check");
    checkAdminIsFreeForm();
    checkSystemIsFreeForm();
    checkRiderIsRestrictedToTwoMoves();
    await checkReasonIsRequired();
    checkNoStaleEnumReferences();
    console.log("\nall checks passed");
})().catch((error) => {
    console.error("\nFAILED:", error.message);
    process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `package.json`, add alongside the other `check:*` scripts:

```json
    "check:orderstatus": "ts-node src/scripts/orderStatus.selfcheck.ts",
```

- [ ] **Step 3: Run it and confirm it fails first (sanity check the check itself is wired correctly)**

Temporarily rename `ASSIGNED_TO_RIDER` to `ASSIGNED_TO_RIDER2` in `orderStatus.constants.ts`'s `canTransition` RIDER branch only (a throwaway one-line edit, not committed) and run:

```bash
npm run check:orderstatus
```

Expected: FAIL — `AssertionError` on `rider must be able to mark DELIVERED` or a TS compile error, proving the check actually exercises the real function. Revert the throwaway edit immediately after confirming the failure.

- [ ] **Step 4: Run it for real and confirm it passes**

```bash
npm run check:orderstatus
```

Expected:
```
order status self-check
  ok - admin can move between all 90 (from, to) pairs
  ok - system role is free-form
  ok - rider is blocked on all 88 other (from, to) pairs
  ok - updateOrderStatusSchema requires a non-empty reason
  ok - no stale enum references across N source files

all checks passed
```

- [ ] **Step 5: Commit**

```bash
git add src/scripts/orderStatus.selfcheck.ts package.json
git commit -m "test: add self-check script for the order-status permission matrix"
```

---

### Task 4: Frontend — unified status mirror, shared status editor, admin modals

**Files:**
- Modify: `src/Components/orderStatus.ts`
- Create: `src/Components/OrderStatusEditor.tsx`
- Modify: `src/Components/Modal/OrderEditModal.tsx`
- Modify: `src/Components/Modal/OrderDetailModal.tsx`
- Modify: `src/services/orderService.ts`

(All paths relative to `DajuVai_React/dajuvai-frontend`.)

**Interfaces:**
- Produces: `OrderStatusValue` type (10 values), `ORDER_STATUS_OPTIONS`, `getOrderStatusMeta(status: string)`, `ALL_ORDER_STATUSES: OrderStatusValue[]` from `Components/orderStatus.ts`.
- Produces: `<OrderStatusEditor currentStatus, onSubmit(status, reason, note), disabled?>` component.
- Consumes: `OrderService.updateOrderStatus(orderId, newStatus, token, { expectedCurrentStatus?, reason, note? })` (reason becomes required — signature unchanged, but callers must now always pass it).

- [ ] **Step 1: Rewrite `Components/orderStatus.ts`**

Replace the entire file:

```ts
/**
 * Frontend mirror of the backend's unified OrderStatus enum
 * (dajuvai-backend/src/entities/order.entity.ts) and its permission
 * matrix (dajuvai-backend/src/constants/orderStatus.constants.ts).
 * There's no shared package between the two repos — keep both in sync
 * when either changes.
 *
 * Admin/staff can move to ANY status at any time (server-enforced, not
 * just this file) — this module no longer gates which options the admin
 * UI offers; it only supplies labels/colors and the full status list.
 */
export type OrderStatusValue =
    | "CREATED"
    | "CONFIRMED"
    | "PROCESSING"
    | "ARRIVED_AT_WAREHOUSE"
    | "DELAYED"
    | "ASSIGNED_TO_RIDER"
    | "DELIVERED"
    | "NOT_RECEIVED"
    | "CANCELLED"
    | "RETURNED";

export interface OrderStatusOption {
    value: OrderStatusValue;
    label: string;
    description: string;
    badgeClass: string;
}

export const ORDER_STATUS_OPTIONS: OrderStatusOption[] = [
    {
        value: "CREATED",
        label: "Order Placed",
        description: "Order received, awaiting confirmation.",
        badgeClass: "status-badge--created",
    },
    {
        value: "CONFIRMED",
        label: "Confirmed",
        description: "Order confirmed, will move into preparation soon.",
        badgeClass: "status-badge--confirmed",
    },
    {
        value: "PROCESSING",
        label: "Processing",
        description: "Order is being prepared by the seller.",
        badgeClass: "status-badge--processing",
    },
    {
        value: "ARRIVED_AT_WAREHOUSE",
        label: "At Warehouse",
        description: "Order has arrived at the warehouse.",
        badgeClass: "status-badge--arrived_at_warehouse",
    },
    {
        value: "DELAYED",
        label: "Delayed",
        description: "Order is taking longer than expected.",
        badgeClass: "status-badge--delayed",
    },
    {
        value: "ASSIGNED_TO_RIDER",
        label: "Out for Delivery",
        description: "Order has been handed to a delivery rider.",
        badgeClass: "status-badge--assigned_to_rider",
    },
    {
        value: "DELIVERED",
        label: "Delivered",
        description: "Order has been delivered.",
        badgeClass: "status-badge--delivered",
    },
    {
        value: "NOT_RECEIVED",
        label: "Not Received",
        description: "Delivery attempt failed — customer did not receive the order.",
        badgeClass: "status-badge--not_received",
    },
    {
        value: "CANCELLED",
        label: "Cancelled",
        description: "Order has been cancelled.",
        badgeClass: "status-badge--cancelled",
    },
    {
        value: "RETURNED",
        label: "Returned",
        description: "Order has been returned.",
        badgeClass: "status-badge--returned",
    },
];

export const ALL_ORDER_STATUSES: OrderStatusValue[] = ORDER_STATUS_OPTIONS.map(
    (option) => option.value,
);

const OPTIONS_BY_VALUE: Record<string, OrderStatusOption> = Object.fromEntries(
    ORDER_STATUS_OPTIONS.map((option) => [option.value, option]),
);

/** Falls back gracefully for legacy status strings still sitting in old
 * history rows (e.g. a pre-migration "PENDING"/"SHIPPED" row) instead of
 * throwing or rendering "undefined". */
export const getOrderStatusMeta = (status: string): OrderStatusOption => {
    const normalized = (status || "").toUpperCase();
    return (
        OPTIONS_BY_VALUE[normalized] ?? {
            value: normalized as OrderStatusValue,
            label: normalized || "Unknown",
            description: "",
            badgeClass: "status-badge--default",
        }
    );
};

/** Every status except the current one — admin/staff can freely move to
 * any of them; the dropdown just needs to exclude the no-op "same status"
 * option. */
export const getAvailableNextStatuses = (
    currentStatus: string,
): OrderStatusOption[] =>
    ORDER_STATUS_OPTIONS.filter(
        (option) => option.value !== currentStatus.toUpperCase(),
    );
```

- [ ] **Step 2: Create the shared `OrderStatusEditor` component**

Create `src/Components/OrderStatusEditor.tsx`:

```tsx
import React, { useState } from "react";
import {
    ALL_ORDER_STATUSES,
    getOrderStatusMeta,
    OrderStatusValue,
} from "./orderStatus";

interface OrderStatusEditorProps {
    currentStatus: string;
    onSubmit: (
        status: OrderStatusValue,
        reason: string,
        note: string,
    ) => Promise<void> | void;
    disabled?: boolean;
    isSaving?: boolean;
}

/** Shared status-change control used by both OrderEditModal (admin edit
 * flow) and OrderDetailModal (admin detail flow) — previously each modal
 * had its own separately-drifting copy of this dropdown+reason+note UI. */
const OrderStatusEditor: React.FC<OrderStatusEditorProps> = ({
    currentStatus,
    onSubmit,
    disabled,
    isSaving,
}) => {
    const [status, setStatus] = useState<OrderStatusValue>(
        currentStatus.toUpperCase() as OrderStatusValue,
    );
    const [reason, setReason] = useState("");
    const [reasonError, setReasonError] = useState("");
    const [note, setNote] = useState("");

    const selectedMeta = getOrderStatusMeta(status);
    const unchanged = status === currentStatus.toUpperCase();

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (unchanged) return;
        if (!reason.trim()) {
            setReasonError("Reason is required");
            return;
        }
        setReasonError("");
        await onSubmit(status, reason.trim(), note.trim());
    };

    return (
        <form
            className="order-status-editor"
            onSubmit={handleSubmit}
        >
            <label className="order-edit-modal__field">
                <span>New status</span>
                <select
                    value={status}
                    onChange={(event) =>
                        setStatus(event.target.value as OrderStatusValue)
                    }
                    disabled={disabled || isSaving}
                >
                    {ALL_ORDER_STATUSES.map((value) => (
                        <option key={value} value={value}>
                            {getOrderStatusMeta(value).label}
                            {value === currentStatus.toUpperCase()
                                ? " (current)"
                                : ""}
                        </option>
                    ))}
                </select>
            </label>

            <div className="order-edit-modal__status-preview">
                <span className={`status-badge status-badge--${status.toLowerCase()}`}>
                    {selectedMeta.label}
                </span>
                <p>{selectedMeta.description}</p>
            </div>

            <label className="order-edit-modal__field">
                <span>Reason *</span>
                <input
                    type="text"
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Required — shown in the status history"
                    disabled={disabled || isSaving}
                />
                {reasonError && (
                    <small style={{ color: "#dc2626" }}>{reasonError}</small>
                )}
            </label>

            <label className="order-edit-modal__field">
                <span>Note</span>
                <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Optional note for this update"
                    rows={3}
                    disabled={disabled || isSaving}
                />
            </label>

            <button
                type="submit"
                className="order-modal__button order-modal__button--primary"
                disabled={disabled || isSaving || unchanged}
            >
                {isSaving ? "Updating..." : "Update status"}
            </button>
        </form>
    );
};

export default OrderStatusEditor;
```

- [ ] **Step 3: Update `orderService.ts`'s `updateOrderStatus` signature**

In `src/services/orderService.ts`, the `options.reason` field is now required by the backend — update the type (the request body shape stays the same, just tighten the type so a caller can't compile without passing it):

```ts
    updateOrderStatus: async (
        orderId: string | number,
        newStatus: string,
        token: string,
        options: {
            expectedCurrentStatus?: string;
            reason: string;
            note?: string;
        },
    ): Promise<any> => {
```

(only the `options` parameter type changes: `reason?: string` → `reason: string`, and it's no longer defaulted to `{}` since `reason` has no sensible default — every call site must now pass it explicitly.)

- [ ] **Step 4: Wire `OrderEditModal.tsx` to the shared editor**

In `src/Components/Modal/OrderEditModal.tsx`, replace the import:

```tsx
import { getAvailableNextStatuses, getOrderStatusMeta } from "../orderStatus";
```

with:

```tsx
import { getOrderStatusMeta } from "../orderStatus";
import OrderStatusEditor from "../OrderStatusEditor";
```

Remove the now-unused local state for `orderStatus`/`reason`/`note` (lines 80-82) and `availableStatusOptions`/`isEditable`/`selectedStatusMeta` (lines 120-134) — the new component owns all of that internally. Remove `handleSubmit` (lines 140-177) — replaced by a smaller handler passed to `OrderStatusEditor`:

```tsx
  const handleStatusUpdate = async (
    newStatus: string,
    reason: string,
    note: string,
  ) => {
    if (!order || !detailedOrder || !token) return;

    setIsSaving(true);
    setError(null);

    try {
      const updatedOrder = await OrderService.updateOrderStatus(
        order.id,
        newStatus,
        token,
        {
          expectedCurrentStatus: detailedOrder.status,
          reason,
          note: note || undefined,
        },
      );
      setDetailedOrder((prev) =>
        prev ? { ...prev, status: updatedOrder.status || newStatus } : prev,
      );
      await onSave(order.id, updatedOrder.status || newStatus);
      toast.success("Order status updated");
      onClose();
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to update order status";
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };
```

Replace the "Status update" section JSX (the `<section className="order-section">` block containing `order-edit-modal__status-card`, roughly the old lines 327-396) with:

```tsx
              <section className="order-section">
                <h3 className="order-section__title">Status update</h3>
                <OrderStatusEditor
                  currentStatus={currentStatus}
                  onSubmit={handleStatusUpdate}
                  isSaving={isSaving}
                />
              </section>
```

The footer's submit button (lines 451-463, `form="order-edit-status-form"`) is removed since `OrderStatusEditor` now renders its own submit button inside its own `<form>` — keep the footer's "Cancel" button only. Remove the `form` prop wiring (`id="order-edit-status-form"` on the outer `<form>`, and the footer button that referenced it) since the outer element no longer needs to be a single form wrapping both the summary and the status editor — change the outer `<form onSubmit={handleSubmit}>` (line 256-260) to a plain `<div>` (it's no longer the thing being submitted; `OrderStatusEditor` has its own inner `<form>` now):

```tsx
            <div className="order-edit-modal__form">
```
(and its matching closing `</div>` where the old `</form>` was, right before the "Recent history" section).

The "Recent history" section (statusHistory rendering, lines 391-437) is unchanged.

- [ ] **Step 5: Wire `OrderDetailModal.tsx` to the shared editor**

In `src/Components/Modal/OrderDetailModal.tsx`, replace the import:

```tsx
import { getAvailableNextStatuses, getOrderStatusMeta } from "../orderStatus";
```

with:

```tsx
import { getOrderStatusMeta } from "../orderStatus";
import OrderStatusEditor from "../OrderStatusEditor";
```

Remove `availableNextStatuses` (lines 98-100) and `handleStatusSave` (lines 102-132) — replace with:

```tsx
    const handleStatusUpdate = async (
        newStatus: string,
        reason: string,
        note: string,
    ) => {
        if (!detailedOrder || !token) return;
        setIsSaving(true);
        try {
            await OrderService.updateOrderStatus(
                detailedOrder.id,
                newStatus,
                token,
                {
                    expectedCurrentStatus: detailedOrder.status,
                    reason,
                    note: note || undefined,
                },
            );
            setDetailedOrder((prev) =>
                prev ? { ...prev, status: newStatus } : prev,
            );
            setCurrentStatus(newStatus);
            onStatusUpdate?.(detailedOrder.id.toString(), newStatus);
            toast.success("Order status updated");
            const history = await OrderService.getOrderStatusHistory(
                detailedOrder.id,
                token,
            );
            setStatusHistory(history);
        } catch (err) {
            toast.error(
                err instanceof Error ? err.message : "Failed to update status",
            );
        } finally {
            setIsSaving(false);
        }
    };
```

Replace the inline `<div className="order-status-select">` block (the `<select>` + `<button>` at lines 264-309) with:

```tsx
                        <OrderStatusEditor
                            currentStatus={currentStatus}
                            onSubmit={handleStatusUpdate}
                            isSaving={isSaving}
                        />
```

The status-history timeline rendering (lines 707-806) is unchanged.

- [ ] **Step 6: Build check**

```bash
npm run build
```

Expected: no TypeScript errors. If `getAvailableNextStatuses` is still imported anywhere else (check with `grep -rn getAvailableNextStatuses src`), fix that call site the same way as Steps 4-5, or keep the export in `orderStatus.ts` if another file still legitimately needs "all statuses except current" (it does — `getOrderStatusMeta`'s sibling `getAvailableNextStatuses` from Step 1 already covers that same need for any remaining caller).

- [ ] **Step 7: Commit**

```bash
git add src/Components/orderStatus.ts src/Components/OrderStatusEditor.tsx src/Components/Modal/OrderEditModal.tsx src/Components/Modal/OrderDetailModal.tsx src/services/orderService.ts
git commit -m "feat: unify admin order-status editing into one shared, reason-required control"
```

---

### Task 5: Frontend — vendor read-only cleanup + status history

**Files:**
- Modify: `src/Components/Modal/ViewModal.tsx`
- Modify: `src/services/vendorDashboardService.ts`

**Interfaces:**
- Consumes: `GET /api/order/vendor/:orderId/status-history` (Task 1, Step 9b).
- Produces: `VendorDashboardService.getInstance().getOrderStatusHistory(token, orderId)`.

- [ ] **Step 0: Add the status-history fetch to `vendorDashboardService.ts`**

Before removing the write method (Step 2 below), add its read-only replacement. In `src/services/vendorDashboardService.ts`, add a new method alongside `updateVendorOrderStatus` (to be deleted in Step 2 — add this one first so the file always has a status-related method, then remove the write one):

```ts
    /** Read-only status timeline for a vendor's own order — vendors can
     * see why a status changed but never change it themselves. */
    async getOrderStatusHistory(
        token: string,
        orderId: number,
    ): Promise<
        Array<{
            id: number;
            previousStatus: string | null;
            newStatus: string;
            changedByRole: string;
            reason: string | null;
            note: string | null;
            createdAt: string;
        }>
    > {
        const realToken = token || localStorage.getItem("vendorToken");
        const response = await fetch(
            `${this.baseUrl}/order/vendor/${orderId}/status-history`,
            {
                headers: {
                    Authorization: `Bearer ${realToken}`,
                    accept: "application/json",
                },
            },
        );
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(data.message || "Failed to load status history");
        }
        return data.data;
    }
```

- [ ] **Step 1: Remove the vendor status-change code from `ViewModal.tsx`**

In `src/Components/Modal/ViewModal.tsx`, remove:
- The `VendorFulfillmentStatus` type and `VENDOR_STATUS_TRANSITIONS`/`VENDOR_STATUS_LABEL` consts (lines 9-34).
- `fulfillmentStatus` field from the `VendorOrderDetail` interface (line 93) — the backend no longer sends it (Task 1, Step 10).
- The `handleStatusChange` function and `nextStatuses` computation (lines 129-163, keep the `authState`/`vendorId`/`isUpdating` lines that are used elsewhere in the file if they are — check with a read of the surrounding context before deleting; if `isUpdating` becomes fully unused after this removal, delete its `useState` too).
- The entire `{false && nextStatuses.length > 0 && (...)}` dead action-button block (lines 466-516) — this was already permanently disabled pending exactly this decision; now that vendors are permanently read-only, delete the block outright instead of leaving a `false &&` landmine for a future reader to wonder about.
- The now-unused `VendorDashboardService` import if this was its only use in the file (check with `grep -n VendorDashboardService src/Components/Modal/ViewModal.tsx` after the above deletions).

The status badge in the header JSX (lines 236-240, showing `orderDetail.status`) is unchanged — vendors still see the real order status, just can't change it.

- [ ] **Step 2: Remove `updateVendorOrderStatus` from `vendorDashboardService.ts`**

In `src/services/vendorDashboardService.ts`, delete the `updateVendorOrderStatus` method (lines 76-102) entirely — its backend route no longer exists (Task 1, Step 9).

- [ ] **Step 3: Render the status-history timeline in `ViewModal.tsx`**

Add a fetch for the new endpoint and a simple read-only timeline render, in the same visual style as the existing timeline in `OrderDetailModal.tsx` (same field names: `previousStatus`, `newStatus`, `changedByRole`, `reason`, `createdAt`).

Add state near the top of the component:

```tsx
    const [statusHistory, setStatusHistory] = useState<
        Array<{
            id: number;
            previousStatus: string | null;
            newStatus: string;
            changedByRole: string;
            reason: string | null;
            note: string | null;
            createdAt: string;
        }>
    >([]);
```

Add a fetch effect (mirroring the existing pattern this component already uses to load `orderDetail` — place it alongside that effect):

```tsx
    useEffect(() => {
        if (!show || !order || !authState.token) return;
        VendorDashboardService.getInstance()
            .getOrderStatusHistory(authState.token, order.id)
            .then(setStatusHistory)
            .catch(() => setStatusHistory([]));
    }, [show, order, authState.token]);
```

(`VendorDashboardService` import stays in the file for this — if Step 1 removed it as unused, re-add it: `import VendorDashboardService from "../../services/vendorDashboardService";`.)

Render the timeline, replacing the deleted `{false && ...}` action block from Step 1 with a read-only history section in the same spot:

```tsx
                    {statusHistory.length > 0 && (
                        <div className="order-section">
                            <h3 className="order-section__title">Status History</h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {statusHistory.map((entry) => (
                                    <div
                                        key={entry.id}
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            gap: 10,
                                            fontSize: 13,
                                            background: "#fff",
                                            padding: "12px 16px",
                                            borderRadius: 8,
                                            border: "1px solid #e5e7eb",
                                        }}
                                    >
                                        <div style={{ minWidth: 130, color: "#6b7280" }}>
                                            {new Date(entry.createdAt).toLocaleString("en-US", {
                                                year: "numeric",
                                                month: "short",
                                                day: "numeric",
                                                hour: "2-digit",
                                                minute: "2-digit",
                                            })}
                                        </div>
                                        <div style={{ textAlign: "right" }}>
                                            <strong>{entry.newStatus}</strong>
                                            <div style={{ color: "#6b7280" }}>
                                                by {entry.changedByRole.toLowerCase()}
                                                {entry.reason ? ` · ${entry.reason}` : ""}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
```

- [ ] **Step 4: Build check**

```bash
npm run build
```

Expected: no TypeScript errors (no dangling references to the deleted type/method).

- [ ] **Step 5: Commit**

```bash
git add src/Components/Modal/ViewModal.tsx src/services/vendorDashboardService.ts
git commit -m "feat: make vendor order status read-only, add vendor status-history view

Removes the vendor status-write endpoint/UI now that vendors can no
longer change order status, and replaces it with a read-only status
timeline so vendors still see what changed and why."
```

---

### Task 6: Frontend — customer-facing label fix + full-stack smoke test

**Files:**
- Modify: `src/Components/Modal/UserOrderDetailModal.tsx`

**Interfaces:**
- Consumes: `getOrderStatusMeta` from `Components/orderStatus.ts` (Task 4).

- [ ] **Step 1: Fix `UserOrderDetailModal.tsx`'s hardcoded delivery-estimate map**

In `src/Components/Modal/UserOrderDetailModal.tsx`, replace `getDeliveryEstimate` (lines 92-99):

```tsx
  const getDeliveryEstimate = () => {
    const status = (detailedOrder?.status || '').toUpperCase();
    if (status === 'DELIVERED') return 'Delivered';
    if (status === 'CANCELLED') return 'Cancelled';
    if (status === 'SHIPPED') return '1-2 days';
    if (status === 'PROCESSING') return '2-3 days';
    return '3-5 days';
  };
```

with:

```tsx
  const getDeliveryEstimate = () => {
    const status = (detailedOrder?.status || '').toUpperCase();
    if (status === 'DELIVERED') return 'Delivered';
    if (status === 'CANCELLED' || status === 'RETURNED') return status === 'CANCELLED' ? 'Cancelled' : 'Returned';
    if (status === 'NOT_RECEIVED') return 'Delivery unsuccessful';
    if (status === 'ASSIGNED_TO_RIDER') return '1-2 days';
    if (status === 'ARRIVED_AT_WAREHOUSE' || status === 'PROCESSING') return '2-3 days';
    return '3-5 days';
  };
```

Also replace the raw status badge (lines 122-125) with the shared meta so labels stay consistent with the admin/vendor views:

```tsx
import { getOrderStatusMeta } from '../orderStatus';
```

```tsx
            <span className={`status-badge status-badge--${(detailedOrder?.status || '').toLowerCase()}`}>
              {detailedOrder?.status ? getOrderStatusMeta(detailedOrder.status).label : 'N/A'}
            </span>
```

- [ ] **Step 2: Build check**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/Components/Modal/UserOrderDetailModal.tsx
git commit -m "fix: extend customer delivery-estimate copy for the new order statuses"
```

- [ ] **Step 4: End-to-end manual smoke test**

With both the backend (`npm run dev` in `dajuvai-backend`) and frontend (`npm start` in `DajuVai_React/dajuvai-frontend`) running against a dev database with the Task 2 migrations applied:

1. Place a test order (any payment method) → confirm it lands on `CREATED` (COD orders go straight to `CONFIRMED`, matching existing checkout logic) and the customer receives the order-placed email.
2. As admin, open the order in `OrderDetailModal` or `OrderEditModal` → the status dropdown offers all 10 statuses. Pick a non-adjacent one (e.g. jump straight to `ASSIGNED_TO_RIDER`) without entering a reason → submit is blocked with "Reason is required" shown inline (no request sent).
3. Enter a reason, submit → success toast, badge updates, status-history panel shows the new row with the reason. Check the customer's inbox for the status-change email and confirm the vendor(s) on the order also received one.
4. Repeat the free-form jump a few more times in non-linear order (e.g. `ASSIGNED_TO_RIDER` → `DELAYED` → `DELIVERED` → `RETURNED`) — every jump must succeed with just a reason, no "invalid transition" error.
5. As a rider (or via the rider dashboard/API directly if no rider is easily assignable in dev), attempt `markDelivered`/`markDeliveryFailed` on an order whose status is `ASSIGNED_TO_RIDER` — confirm both succeed, and that the order's status-history now shows a `RIDER`-attributed row (previously this path produced zero history rows).
6. As a vendor, open the vendor order view for the same order — confirm the status badge shows the current value read-only, with no status-change controls rendered anywhere, and the status-history timeline is visible.
7. Directly call `PUT /api/order/vendor/:orderId/status` (e.g. via curl/Postman) — confirm it now 404s (route removed).
8. Confirm `npx tsc --noEmit` (backend) and `npm run build` (frontend) both stay clean after the full click-through — no console errors in the browser dev tools during any of the above.

Report back on this task with a completed/pending checklist for each of the 8 points above — this is the plan's real "does it work end to end" gate, since none of it can be verified by a compiler alone.
