import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
} from "typeorm";
import { Order } from "./order.entity";
import { Vendor } from "./vendor.entity";
import { ShippingZone } from "../service/shipping.service";

/**
 * A vendor's own fulfillment stage for their part of a (possibly
 * multi-vendor) order — distinct from Order.status (overall order
 * lifecycle, admin/customer-facing) and Order.deliveryStatus (courier leg).
 * Only the vendor that owns this row (or an admin) may change it.
 */
export enum VendorOrderStatus {
    CONFIRMED = "CONFIRMED",
    PROCESSING = "PROCESSING",
    SHIPPED = "SHIPPED",
    DELIVERED = "DELIVERED",
    CANCELLED = "CANCELLED",
}

export const VENDOR_ORDER_STATUS_TRANSITIONS: Record<VendorOrderStatus, VendorOrderStatus[]> = {
    [VendorOrderStatus.CONFIRMED]: [VendorOrderStatus.PROCESSING, VendorOrderStatus.CANCELLED],
    [VendorOrderStatus.PROCESSING]: [VendorOrderStatus.SHIPPED, VendorOrderStatus.CANCELLED],
    [VendorOrderStatus.SHIPPED]: [],
    [VendorOrderStatus.DELIVERED]: [],
    [VendorOrderStatus.CANCELLED]: [],
};

/**
 * Immutable per-vendor shipping snapshot, written once at checkout.
 * Never recomputed from live vendor/customer data — historical orders
 * must keep showing the fee that was actually charged, even if the
 * vendor's district or the shipping rates change later.
 */
@Entity("order_vendor_shippings")
@Index(["orderId", "vendorId"], { unique: true })
export class OrderVendorShipping {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Order, (order) => order.vendorShippings, { onDelete: "CASCADE" })
    @JoinColumn({ name: "orderId" })
    order: Order;

    @Column()
    orderId: number;

    @ManyToOne(() => Vendor, { onDelete: "CASCADE" })
    @JoinColumn({ name: "vendorId" })
    vendor: Vendor;

    @Column()
    vendorId: number;

    @Column({ nullable: true })
    vendorNameSnapshot: string;

    @Column({ nullable: true })
    vendorDistrictSnapshot: string;

    @Column({ nullable: true })
    customerDistrictSnapshot: string;

    @Column({ type: "enum", enum: ShippingZone })
    shippingZone: ShippingZone;

    @Column("decimal", { precision: 8, scale: 2 })
    shippingFee: number;

    @Column("decimal", { precision: 10, scale: 2 })
    vendorMerchandiseSubtotal: number;

    @Column("decimal", { precision: 10, scale: 2 })
    vendorTotal: number;

    @Column({ type: "enum", enum: VendorOrderStatus, default: VendorOrderStatus.CONFIRMED })
    status: VendorOrderStatus;

    @CreateDateColumn()
    createdAt: Date;
}
