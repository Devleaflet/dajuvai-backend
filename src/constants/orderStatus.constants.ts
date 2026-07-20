import { OrderStatus } from "../entities/order.entity";

/**
 * Single authoritative order-status transition map. order.service.ts is the
 * only place that mutates Order.status, and it must always check this map
 * first — do not duplicate this list elsewhere in the backend.
 *
 * The frontend keeps its own mirrored copy (Components/orderStatus.ts)
 * since there's no shared package between the two repos; keep both in sync
 * when this changes.
 */
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.DELAYED, OrderStatus.CANCELLED],
    [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.DELAYED, OrderStatus.CANCELLED],
    [OrderStatus.DELAYED]: [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.CANCELLED],
    [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
    [OrderStatus.DELIVERED]: [OrderStatus.RETURNED],
    [OrderStatus.RETURNED]: [],
    [OrderStatus.CANCELLED]: [],
};
