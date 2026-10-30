import { Order, OrderStatus, PaymentStatus } from "../entities/order.entity";
import { AuditActorType } from "../entities/auditLog.entity";
import type { StatusActorRole } from "../constants/orderStatus.constants";

type Deps = {
    saveOrder: (order: Order) => Promise<unknown>;
    changeOrderStatus: (
        orderId: number,
        status: OrderStatus,
        options: { actorRole: StatusActorRole; auditActorType: AuditActorType; reason: string },
    ) => Promise<unknown>;
};

/**
 * An NPX payment the gateway confirmed: record it as paid, then move the order
 * to CONFIRMED through `changeOrderStatus` — the one place that writes status
 * history, the audit entry and the CONFIRMED email. Writing the status here
 * directly skipped all three (QA BUG-011). Confirming an already-confirmed
 * order is a no-op there, so a repeated notification is harmless.
 */
export async function confirmPaidNpxOrder(order: Order, deps: Deps): Promise<void> {
    order.paymentStatus = PaymentStatus.PAID;
    await deps.saveOrder(order);
    await deps.changeOrderStatus(order.id, OrderStatus.CONFIRMED, {
        actorRole: "SYSTEM",
        auditActorType: AuditActorType.SYSTEM,
        reason: "Payment received",
    });
}
