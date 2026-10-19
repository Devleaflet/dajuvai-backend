import {
    Column,
    CreateDateColumn,
    Entity,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from "typeorm";
import { Product } from "./product.entity";
import { Vendor } from "./vendor.entity";
import { Order } from "./order.entity";
import { Variant } from "./variant.entity";
import { User } from "./user.entity";

export enum OrderStatus {
    PENDING = "PENDING",
    CONFIRMED = "CONFIRMED",
    PROCESSING = "PROCESSING",
    SHIPPED = "SHIPPED",
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
    DELIVERED = "DELIVERED",
}

/**
 * Independent per-item fulfillment state (multi-vendor partial
 * availability). One customer order stays one order; each item is
 * confirmed or cancelled individually by admin. Parent Order.status
 * is derived from these in OrderService.updateOrderItemFulfillment().
 */
export enum ItemFulfillmentStatus {
    PENDING = "PENDING",
    CONFIRMED = "CONFIRMED",
    CANCELLED = "CANCELLED",
}

@Entity("order_items")
export class OrderItem {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Product, (product) => product.orderItems, {
        onDelete: "CASCADE",
    })
    @JoinColumn({ name: "productId" })
    product: Product;

    @Column()
    productId: number;

    @Column()
    quantity: number;

    @Column("decimal", { precision: 8, scale: 2 })
    price: number;

    @ManyToOne(() => Order, (order) => order.orderItems, {
        onDelete: "CASCADE",
    })
    @JoinColumn({ name: "orderId" })
    order: Order;

    @Column()
    orderId: number;

    @ManyToOne(() => Vendor, (vendor) => vendor.orderItems)
    @JoinColumn({ name: "vendorId" })
    vendor: Vendor;

    @Column()
    vendorId: number;

    @ManyToOne(() => Variant, { nullable: true })
    @JoinColumn({ name: "variantId" })
    variant?: Variant;

    @Column({ nullable: true })
    variantId?: number;

    @Column({ nullable: true })
    productNameSnapshot?: string;

    @Column({ nullable: true })
    skuSnapshot?: string;

    @Column({ nullable: true })
    imageSnapshot?: string;

    @Column("decimal", { precision: 8, scale: 2, nullable: true })
    unitPriceSnapshot?: number;

    @Column("decimal", { precision: 8, scale: 2, nullable: true })
    basePriceSnapshot?: number;

    @Column("decimal", { precision: 8, scale: 2, default: 0 })
    productDiscountSnapshot: number;

    @Column("decimal", { precision: 8, scale: 2, default: 0 })
    dealDiscountSnapshot: number;

    @Column({ nullable: true })
    discountTypeSnapshot?: string;

    @Column({ nullable: true })
    discountLabelSnapshot?: string;

    @Column({ nullable: true })
    dealNameSnapshot?: string;

    @Column("decimal", { precision: 5, scale: 2, nullable: true })
    dealPercentSnapshot?: number;

    // did this item reach warehouse from vendor
    @Column({ default: false })
    collectedAtWarehouse: boolean;

    @Column({
        type: "enum",
        enum: ItemFulfillmentStatus,
        default: ItemFulfillmentStatus.PENDING,
    })
    fulfillmentStatus: ItemFulfillmentStatus;

    // Mandatory when fulfillmentStatus = CANCELLED; null otherwise.
    @Column({ type: "varchar", length: 1000, nullable: true })
    cancellationRemark?: string | null;

    @Column({ type: "timestamptz", nullable: true })
    confirmedAt?: Date | null;

    @Column({ type: "timestamptz", nullable: true })
    cancelledAt?: Date | null;

    // Admin/staff account that last confirmed/cancelled this item.
    @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "updatedById" })
    updatedBy?: User | null;

    @Column({ nullable: true })
    updatedById?: number | null;

    @CreateDateColumn()
    createdAt: Date;
}
