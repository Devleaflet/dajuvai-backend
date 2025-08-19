import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn, OneToOne } from 'typeorm';
import { Product } from './product.entity';
import { OrderItem } from './orderItems.entity';
import { District } from './district.entity';

@Entity()
export class Vendor {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    businessName: string;

    @Column({ unique: true })
    email: string;

    @Column()
    password: string;

    @Column()
    phoneNumber: string;

    @ManyToOne(() => District, district => district.vendors, { eager: true })
    @JoinColumn({ name: 'districtId' })
    district: District;

    @Column({ nullable: true })
    districtId: number;

    @Column({ nullable: true })
    verificationCode: string | null;

    @Column({ nullable: true })
    verificationCodeExpire: Date | null;

    @Column({ default: true })
    isVerified: boolean;

    @Column({ default: false })
    isApproved: boolean;

    @Column({ type: "varchar", nullable: true })
    taxNumber: string; // vat or pan number

    @Column({ type: "text", nullable: true })
    taxDocument: string; // pdf or image link 

    @Column({ nullable: true })
    resetToken: string | null; // used

    @Column({ nullable: true })
    resetTokenExpire: Date | null; // used

    @Column({ default: 0 })
    resendCount: number;

    @Column({ nullable: true })
    resendBlockUntil: Date | null;

    @OneToMany(() => Product, (product) => product.vendor)
    products: Product[];

    @OneToMany(() => OrderItem, (orderItem) => orderItem.product)
    orderItems: OrderItem[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}