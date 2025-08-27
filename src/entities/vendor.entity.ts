import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
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
    businessRegNumber: string; // ✅ Added

    @Column({ type: "varchar", nullable: true })
    taxNumber: string;

    @Column("text", { array: true, nullable: true })
    taxDocuments: string[];

    @Column("text", { array: true, nullable: true })
    citizenshipDocuments: string[];

    @Column({ type: "varchar", nullable: true })
    chequePhoto: string;

    // ✅ Flattened bank details
    @Column({ type: "varchar", nullable: true })
    accountName: string;

    @Column({ type: "varchar", nullable: true })
    bankName: string;

    @Column({ type: "varchar", nullable: true })
    accountNumber: string;

    @Column({ type: "varchar", nullable: true })
    bankBranch: string;

    @Column({ type: "varchar", nullable: true })
    bankCode: string | null;

    @Column({ nullable: true })
    verificationCode: string | null;

    @Column({ nullable: true })
    verificationCodeExpire: Date | null;

    @Column({ default: false })
    isVerified: boolean;

    @Column({ default: false })
    isApproved: boolean;

    @Column({ nullable: true })
    resetToken: string | null;

    @Column({ nullable: true })
    resetTokenExpire: Date | null;

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
