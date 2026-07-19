import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from "typeorm";
import { Order, OrderStatus } from "./order.entity";
import { User } from "./user.entity";

export enum OrderStatusChangedByRole {
    ADMIN = "ADMIN",
    VENDOR = "VENDOR",
    SYSTEM = "SYSTEM",
    CUSTOMER = "CUSTOMER",
}

/**
 * Append-only audit trail of order status changes. Every transition writes
 * one row here instead of just overwriting Order.status — the timeline
 * shown in the order-details view is read straight from this table.
 */
@Entity("order_status_histories")
@Index(["orderId", "createdAt"])
export class OrderStatusHistory {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Order, { onDelete: "CASCADE" })
    @JoinColumn({ name: "orderId" })
    order: Order;

    @Column()
    orderId: number;

    // Set when this row records a per-vendor fulfillment change
    // (OrderVendorShipping.status) rather than the parent Order.status.
    @Column({ nullable: true })
    vendorOrderId: number | null;

    @Column({ type: "enum", enum: OrderStatus, nullable: true })
    previousStatus: OrderStatus | null;

    @Column({ type: "enum", enum: OrderStatus })
    newStatus: OrderStatus;

    @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "changedByUserId" })
    changedBy: User | null;

    @Column({ nullable: true })
    changedByUserId: number | null;

    @Column({ type: "enum", enum: OrderStatusChangedByRole })
    changedByRole: OrderStatusChangedByRole;

    @Column({ nullable: true })
    reason: string | null;

    @Column({ nullable: true })
    note: string | null;

    @CreateDateColumn()
    createdAt: Date;
}
