import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    ManyToOne,
    JoinColumn
} from "typeorm";
import { Vendor } from "./vendor.entity";
import { User } from "./user.entity";
import { Order } from "./order.entity";

export enum NotificationType {
    ORDER_PLACED = "ORDER_PLACED",
    ORDER_STATUS_UPDATED = "ORDER_STATUS_UPDATED",
    GENERAL = "GENERAL"
}

export enum NotificationTarget {
    ADMIN = "ADMIN",
    VENDOR = "VENDOR",
    USER = "USER"
}

@Entity("notifications")
export class Notification {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    // Notification title (e.g. "New Order Placed")
    @Column({ type: "varchar", length: 20 })
    title: string;

    //  Message body (e.g. "Order #123 has been placed by John Doe")
    @Column({ type: "text" })
    message: string;

    //  Notification type (ORDER_PLACED, ORDER_STATUS_UPDATED, etc.)
    @Column({
        type: "enum",
        enum: NotificationType,
        default: NotificationType.GENERAL
    })
    type: NotificationType;

    //  Target audience (ADMIN, VENDOR, USER)
    @Column({
        type: "enum",
        enum: NotificationTarget
    })
    target: NotificationTarget;

    //  Mark if the notification is read or not
    @Column({ default: false })
    isRead: boolean;

    // //  Link to related page (e.g. /orders/123)
    // @Column({ nullable: true })
    // link: string;

    //  Optional: Vendor who receives the notification
    @ManyToOne(() => Vendor, { nullable: true, onDelete: "CASCADE" })
    @JoinColumn({ name: "vendorId" })
    vendor?: Vendor;

    @Column({ nullable: true })
    vendorId?: number;

    //  Optional: Admin or user who triggered the action
    @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "createdById" })
    createdBy?: User;

    @Column({ nullable: true })
    createdById?: number;

    //  Order related to this notification
    @ManyToOne(() => Order, { nullable: true, onDelete: "CASCADE" })
    @JoinColumn({ name: "orderId" })
    order?: Order;

    @Column({ nullable: true })
    orderId?: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
