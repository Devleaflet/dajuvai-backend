import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Product } from "./product.entity";
import { Vendor } from "./vendor.entity";
import { Order } from "./order.entity";

export enum OrderStatus {
    PENDING = "PENDING",
    CONFIRMED = "CONFIRMED",
    PROCESSING = "PROCESSING",
    SHIPPED = "SHIPPED",
    OUT_FOR_DELIVERY = "OUT_FOR_DELIVERY",
    DELIVERED = "DELIVERED"
}

export enum PaymentStatus {
    PENDING = "PENDING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    CASH_ON_DELIVERY = "CASH_ON_DELIVERY"
}

@Entity('order_items')
export class OrderItem {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Product, (product) => product.orderItems, { onDelete: "CASCADE" })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column()
    productId: number;

    @Column()
    quantity: number;

    @Column('decimal', { precision: 8, scale: 2 })
    price: number;

    @ManyToOne(() => Order, (order) => order.orderItems, { onDelete: "CASCADE" })
    @JoinColumn({ name: 'orderId' })
    order: Order;

    @Column()
    orderId: number;

    @ManyToOne(() => Vendor, (vendor) => vendor.orderItems)
    @JoinColumn({ name: 'vendorId' })
    vendor: Vendor;

    @Column()
    vendorId: number;

    @CreateDateColumn()
    createdAt: Date;
}

