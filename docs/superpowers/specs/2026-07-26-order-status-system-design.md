# Order Status System Overhaul — Design

Date: 2026-07-26
Status: Approved for planning

## Problem

The order-status system has three independent, drifting status domains:

- `Order.status` (`OrderStatus`, 8 values: PENDING/CONFIRMED/PROCESSING/DELAYED/SHIPPED/DELIVERED/CANCELLED/RETURNED)
- `Order.deliveryStatus` (`DeliveryStatus`, 8 values: order_processing/at_warehouse/ready_for_delivery/rider_assigned/out_for_delivery/delivered/delivery_failed/returned_warehouse)
- `OrderVendorShipping.status` (`VendorOrderStatus`, 5 values: CONFIRMED/PROCESSING/SHIPPED/DELIVERED/CANCELLED)

Findings from the current-state audit:

- `ORDER_STATUS_TRANSITIONS` (backend constant) is imported into `order.service.ts` but **never checked** — admin status changes are already effectively free-form at the DB layer today. The only real gate is the frontend mirror (`Components/orderStatus.ts`), which restricts what an admin user can even select in the UI.
- `recordStatusChange` (the `OrderStatusHistory` audit-log writer) is called from `order.service.ts`'s `updateOrderStatus`/`updateVendorOrderStatus`/`handlePaymentCancel`, but **not** from `delivery.rider.service.ts` or `delivery.admin.service.ts`'s `backToWarehouse` — rider-driven and some warehouse-driven status changes are invisible in the audit trail, send no status email, and fire no in-app notification.
- `delivery.service.ts` + `delivery.controller.ts` are orphaned duplicates of `delivery.admin.service.ts`/`delivery.admin.controller.ts` (drifted, more-restrictive transition map) — the wider delivery/rider module is a known **not-fully-implemented feature that gets its own rebuild in a later task**; this task does not touch, delete, or restructure it beyond wiring its actions into the new audit/email/notification path (see Services below).
- Vendors currently have a write endpoint (`PUT /api/order/vendor/:orderId/status`) touching their own `OrderVendorShipping.status` — per product decision below, this is being removed; vendors become read-only.
- No websocket event exists for order-status changes — UI relies on refresh/poll only.

## Decisions (confirmed with product owner)

1. **`Order.status` becomes one unified 10-value enum**, replacing the 8-value `OrderStatus` and used as the single order-lifecycle field admin/rider/customer/vendor all read. **`Order.deliveryStatus` (`DeliveryStatus`) is left exactly as it is today** — separate column, separate enum, untouched. The delivery/rider module (`delivery.admin.service.ts`, `delivery.rider.service.ts`, `delivery.service.ts`, `delivery.controller.ts`, `DeliveryAssignment`) is not fully built out yet and its proper rebuild is a **separate, later task** — nothing in this task deletes, merges, or restructures it. The only change this task makes to that module is having its status-changing actions (`markAtWarehouse`, `assignRider`, rider `markDelivered`/`markDeliveryFailed`) additionally call the new `changeOrderStatus` so `Order.status` progresses correctly and gets an audit/email/notification trail — the module's own internals and `deliveryStatus` writes are untouched.
2. **Vendors are read-only.** `OrderVendorShipping.status`/`VendorOrderStatus` is removed entirely. Vendors see order status; they cannot change it. (This is unrelated to the delivery module above — it's the vendor's own per-line-item status field.)
3. **Riders get exactly two moves.** A rider may only transition an order assigned to them from `ASSIGNED_TO_RIDER` to `DELIVERED` or to `NOT_RECEIVED` (reason required on the latter). No intermediate "picked up" status. This governs the new `Order.status` only — it does not change how `delivery.rider.service.ts` manages `deliveryStatus`/`DeliveryAssignment` internally.
4. **Admin/staff are fully free-form.** Any status → any other status, at any time, with a mandatory reason (note optional). No transition-graph restriction for this role.

## The 10 statuses

```
CREATED               (was PENDING)
CONFIRMED
PROCESSING
ARRIVED_AT_WAREHOUSE  (new order-level value; coarse counterpart of DeliveryStatus.at_warehouse/ready_for_delivery, which keep existing separately)
DELAYED
ASSIGNED_TO_RIDER     (new order-level value; coarse counterpart of DeliveryStatus.rider_assigned/out_for_delivery, which keep existing separately; also replaces SHIPPED)
DELIVERED
NOT_RECEIVED          (new order-level value; coarse counterpart of DeliveryStatus.delivery_failed, which keeps existing separately)
CANCELLED
RETURNED
```

`DeliveryStatus` keeps its own 8 values and its own lifecycle inside the delivery module, unchanged. `Order.status` and `Order.deliveryStatus` are two independent fields going forward — this task does not attempt to keep them in perfect lockstep beyond the specific hook points listed under Services (rider/warehouse actions push both).

## Permission matrix

| Role | Allowed transitions | Required fields |
|---|---|---|
| Admin/Staff | any → any | `reason` (required), `note` (optional) |
| Rider | `ASSIGNED_TO_RIDER → DELIVERED`; `ASSIGNED_TO_RIDER → NOT_RECEIVED`, only on orders assigned to them | `reason` required for `NOT_RECEIVED` |
| Vendor | none (read-only) | — |
| System (payment webhooks, auto jobs) | existing narrow internal transitions unchanged (e.g. `CREATED → CONFIRMED` on payment success, `→ CANCELLED` on payment failure) | internal, not user-supplied |

Special case: setting `ASSIGNED_TO_RIDER` requires a `riderId` in the request (creates/reuses a `DeliveryAssignment` row) — this is the one field-level requirement layered on top of admin's otherwise-unrestricted status choice, so assignment data is never orphaned.

## Backend changes

**Entities**
- `order.entity.ts`: new 10-value `OrderStatus` enum. `DeliveryStatus` enum and `deliveryStatus` column are **not touched**.
- `orderVendorShipping.entity.ts`: remove `VendorOrderStatus` enum, `status` column, `VENDOR_ORDER_STATUS_TRANSITIONS`.
- `orderStatusHistory.entity.ts`: unchanged (already has `reason`, `note`, `changedByRole`, `previousStatus`/`newStatus`, `vendorOrderId`) — `vendorOrderId` becomes unused going forward but the column stays for historical rows; new rows always target the parent order.

**Constants**
- `orderStatus.constants.ts`: replace the stale, unenforced transition map with the real permission logic — a `canTransition(role, from, to)` helper encoding the matrix above. Delete the misleading doc-comment.

**Services**
- `order.service.ts`: introduce a single `changeOrderStatus(orderId, targetStatus, actor, { reason, note, riderId?, expectedCurrentStatus? })` — the **only** function permitted to write `Order.status` anywhere in the codebase. Responsibilities:
  - Permission check via `canTransition`.
  - Optimistic-concurrency check via `expectedCurrentStatus` (existing behavior, kept).
  - `ARRIVED_AT_WAREHOUSE`: existing per-item `collectedAtWarehouse` checklist logic moves here as a precondition/side effect, not a separate status.
  - `ASSIGNED_TO_RIDER`: requires `riderId`; creates/updates the `DeliveryAssignment` row (reusing existing `assignRider` logic); blocks if an active non-terminal assignment already exists (existing rule, kept).
  - `CANCELLED` / `NOT_RECEIVED` / `RETURNED`: restock logic (existing `restoreStock`, extended to cover `NOT_RECEIVED`).
  - COD-to-`DELIVERED` payment-status flip (existing behavior, kept, de-duplicated — today it runs twice).
  - Always calls `recordStatusChange` (reason now required at the Zod layer for admin/rider-initiated changes; system-initiated changes keep a fixed internal reason string as today).
  - Always sends the customer status email (`sendOrderStatusEmail`), sends the vendor notification email for fulfillment-relevant transitions (extended list, see below).
  - Always calls `notificationService.notifyOrderStatusUpdated`.
  - Emits a new `order:statusUpdated` websocket event to the customer's and each vendor's room.
  - Old call sites route through this: `updateOrderStatus`'s admin logic, `handlePaymentCancel`'s inline write. `updateVendorOrderStatus` is deleted (no vendor writes).
  - `confirmPickup` is not part of the rider's 2 allowed `Order.status` moves — a rider marking pickup does not change `Order.status` (it may still update `deliveryStatus`/`DeliveryAssignment` internally, untouched by this task).
- `delivery.admin.service.ts`: internals (rider CRUD, warehouse queue, per-item collection checklist, `deliveryStatus` writes) are **left as-is** — not restructured, not rewritten. The only addition: `markAtWarehouse` also calls `changeOrderStatus(..., ARRIVED_AT_WAREHOUSE)` and `assignRider` also calls `changeOrderStatus(..., ASSIGNED_TO_RIDER, { riderId })`, so `Order.status` progresses alongside the existing `deliveryStatus` progression.
- `delivery.rider.service.ts`: internals left as-is. `markDelivered` additionally calls `changeOrderStatus(..., DELIVERED)`; `markDeliveryFailed` additionally calls `changeOrderStatus(..., NOT_RECEIVED, { reason })`. Permission matrix (rider, 2 moves, assigned-order-only) is enforced inside `changeOrderStatus`, not duplicated per call site.
- `delivery.service.ts` / `delivery.controller.ts`: **left untouched**, not deleted — despite being unwired duplicates, removing them is out of scope for this task since the whole delivery module gets rebuilt later.

**Routes**
- `PUT /api/order/admin/:orderId/status` — admin/staff, free-form, body `{ status, reason, note?, riderId?, expectedCurrentStatus? }`.
- `PUT /api/order/vendor/:orderId/status` — removed.
- Rider: two existing action endpoints under `delivery.rider.routes.ts` keep their paths but call the two allowed targets only.
- `GET /api/order/admin/:orderId/status-history` — unchanged, still the audit-log read endpoint, now complete (no more blind spots).

**Zod (`order.zod.ts`)**
- `updateOrderStatusSchema`: `status: z.nativeEnum(OrderStatus)`, `reason: z.string().min(1).max(500)` (now required), `note: z.string().max(1000).optional()`, `riderId: z.number().int().positive().optional()`, `expectedCurrentStatus` optional (unchanged).
- `updateVendorOrderStatusSchema`: removed.
- Rider action schemas: `reason` required on the not-received endpoint.

## Migration

One TypeORM migration:
1. Add the 4 new enum labels (`CREATED`, `ARRIVED_AT_WAREHOUSE`, `ASSIGNED_TO_RIDER`, `NOT_RECEIVED`) alongside existing ones (Postgres enum values can't be renamed/removed in-place mid-migration without a rebuild, so the migration recreates the `OrderStatus` enum type — `DeliveryStatus` enum/column are untouched by this migration).
2. Backfill every existing row's `(status, deliveryStatus)` pair to exactly one new `status` value, explicit mapping table in the migration file (`deliveryStatus` itself is read here only to pick the right new `status` value — the column and its own values are left as-is afterward):
   - `PENDING → CREATED`
   - `CONFIRMED` (any deliveryStatus) `→ CONFIRMED`
   - `PROCESSING` + `deliveryStatus=order_processing → PROCESSING`
   - `PROCESSING`/`DELAYED` + `deliveryStatus∈{at_warehouse,ready_for_delivery} → ARRIVED_AT_WAREHOUSE`
   - `DELAYED` (no warehouse/rider deliveryStatus) `→ DELAYED`
   - `SHIPPED` + `deliveryStatus∈{rider_assigned,out_for_delivery} → ASSIGNED_TO_RIDER`
   - `DELIVERED` (any) `→ DELIVERED`
   - any + `deliveryStatus=delivery_failed → NOT_RECEIVED`
   - `CANCELLED → CANCELLED`
   - `RETURNED` or `deliveryStatus=returned_warehouse → RETURNED`
3. Drop `OrderVendorShipping.status` column and `VendorOrderStatus` enum type (vendor read-only decision — unrelated to the delivery module).

Mapping is deterministic and logged row-count-per-bucket during migration run for auditability.

## Emails, notifications, realtime

- `getOrderStatusEmailMeta` / `getVendorOrderStatusEmailMeta`: add entries for `CREATED`, `ARRIVED_AT_WAREHOUSE`, `ASSIGNED_TO_RIDER`, `NOT_RECEIVED` — same visual skeleton (gradient header, status pill, CTA), professional accurate copy per status.
- Vendor email sent for: `CONFIRMED, PROCESSING, ARRIVED_AT_WAREHOUSE, DELAYED, ASSIGNED_TO_RIDER, DELIVERED, NOT_RECEIVED, CANCELLED, RETURNED` (i.e. everything except the initial `CREATED`, which the existing order-placed email already covers).
- `notifyOrderStatusUpdated` fires for every transition, from the single `changeOrderStatus` choke point (closes the rider/warehouse blind spot).
- New `order:statusUpdated` socket event emitted to `user:{id}` and each relevant `vendor:{id}` room — greenfield, no prior order-status socket event existed.

## Frontend (`DajuVai_React`)

- `Components/orderStatus.ts`: mirror the new 10-value enum, labels, badge colors. Drop the transition-map-as-gate function; admin dropdown offers all 10 (current one disabled/shown as active).
- New shared `<OrderStatusEditor>` component (dropdown + required reason + optional note), used by both `OrderEditModal.tsx` and `OrderDetailModal.tsx` instead of duplicated logic in each.
- `ViewModal.tsx` (vendor): status-change control removed; read-only badge + shared history timeline.
- New shared status-history timeline component (consumes `getOrderStatusHistory`), used in both admin and vendor order-detail views.
- Rider dashboard: two action buttons (Delivered / Not Received with reason field) wired to the two rider endpoints.
- `services/orderService.ts`: drop vendor-status-update call; `updateOrderStatus` request body gains `reason` (required), `riderId` (conditional).
- `services/vendorDashboardService.ts`: drop `updateVendorOrderStatus`.

## Error handling

- Missing/empty `reason` on admin or not-received rider action → 400 via Zod, before hitting the service.
- `ASSIGNED_TO_RIDER` without `riderId`, or with a rider who already has an active non-terminal assignment on a different order → 400 with a clear message (existing rule, kept).
- Rider attempting any transition other than their 2 allowed moves, or acting on an order not assigned to them → 403.
- Vendor attempting to call a status-write endpoint → 404 (route no longer exists) — confirmed acceptable since the route is removed outright, not just gated.
- Optimistic-concurrency mismatch (`expectedCurrentStatus` stale) → existing 409 `OrderStateChangedError`, unchanged.
- Email/notification/socket failures are caught and logged individually (existing pattern in `sendOrderEmails`) — never allowed to fail the status-change transaction itself.

## Testing plan (manual, step-by-step post-implementation)

1. Create an order → confirm `CREATED` status, email sent, history row written.
2. Admin jumps through all 10 statuses in arbitrary (non-linear) order → each requires reason, writes history, sends customer email, sends vendor email (except `CREATED`), emits socket event.
3. Admin sets `ASSIGNED_TO_RIDER` without `riderId` → 400. With `riderId` → `DeliveryAssignment` created, rider sees it on their dashboard.
4. Rider marks `DELIVERED` → succeeds, history logged with rider as actor. Separately, rider marks `NOT_RECEIVED` without reason → 400; with reason → succeeds.
5. Rider attempts a transition outside their 2 allowed moves, or on an order not assigned to them → 403.
6. Vendor order view → status shown read-only, no edit control renders, history timeline visible, old vendor-status-update route returns 404.
7. Run the migration against a snapshot/copy of production-shaped data; verify row counts per old-status bucket match the mapping table and no order lands in an unmapped/null status.
