import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";
import { Address } from "./address.entity";
import { OrderItem } from "./orderItems.entity";


export enum OrderStatus {
    CONFIRMED = "CONFIRMED",
    DELAYED = "DELAYED",
    SHIPPED = "SHIPPED",
    DELIVERED = "DELIVERED",
    CANCELLED = "CANCELLED",
    RETURNED = "RETURNED"
}

export enum PaymentStatus {
    PAID = "PAID",
    UNPAID = "UNPAID",
}


export enum PaymentMethod {
    ONLINE_PAYMENT = "ONLINE_PAYMENT",
    CASH_ON_DELIVERY = "CASH_ON_DELIVERY",
    KHALIT = "KHALTI",
    ESEWA = "ESEWA",
    NPX = "NPX"
}

@Entity('orders')
export class Order {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => User, (user) => user.orders, { onDelete: "CASCADE" })
    @JoinColumn({ name: 'orderedById' })
    orderedBy: User;

    @Column()
    orderedById: number;

    @Column('decimal', { precision: 10, scale: 2 })
    totalPrice: number;

    @Column('decimal', { precision: 8, scale: 2 })
    shippingFee: number;

    @Column({ nullable: true })
    isBuyNow?: boolean


    @Column({
        type: "enum",
        enum: PaymentStatus,
        default: PaymentStatus.UNPAID
    })
    paymentStatus: PaymentStatus;

    @Column({
        type: "enum",
        enum: PaymentMethod,
    })
    paymentMethod: PaymentMethod;

    @Column({
        type: "enum",
        enum: OrderStatus,
        default: OrderStatus.CONFIRMED
    })
    status: OrderStatus;

    @ManyToOne(() => Address, (address) => address.orders)
    @JoinColumn({ name: 'shippingAddressId' })
    shippingAddress: Address;

    @Column({ nullable: true })
    appliedPromoCode: string;

    @Column({ nullable: true })
    phoneNumber: string;

    // @Column()
    // shippingAddressId: number;

    @OneToMany(() => OrderItem, item => item.order, { cascade: true })
    orderItems: OrderItem[];

    @Column('decimal', { precision: 8, scale: 2, default: 0 })
    serviceCharge: number;

    @Column({ nullable: true })
    instrumentName: string;

    @Column({ nullable: true })
    mTransactionId: string

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}