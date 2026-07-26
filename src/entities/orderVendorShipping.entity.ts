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

  @ManyToOne(() => Order, (order) => order.vendorShippings, {
    onDelete: "CASCADE",
  })
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

  @CreateDateColumn()
  createdAt: Date;
}
