import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    ManyToOne,
    JoinColumn,
    Index,
} from "typeorm";
import { Product } from "./product.entity";
import { OrderItem } from "./orderItems.entity";
import { District } from "./district.entity";
import { VendorPaymentOption } from "./vendorPaymentOption";

export enum PaymentOption {
    ESEWA = "ESEWA",
    KHALTI = "KHALTI",
    NPS = "NPS",
    BANK = "BANK",
}

@Entity()
export class Vendor {
    @PrimaryGeneratedColumn()
    id: number;

    /** URL identifier derived from the name. Assigned by `SlugSubscriber`; never written directly. */
    @Index("UQ_vendor_slug", { unique: true })
    @Column({ type: "varchar", length: 128 })
    slug: string;

    @Column()
    businessName: string;

    @Column({ unique: true })
    email: string;

    @Column()
    password: string;

    @Column()
    phoneNumber: string;

    @Column({ nullable: true })
    telePhone: string;

    @ManyToOne(() => District, (district) => district.vendors, { eager: true })
    @JoinColumn({ name: "districtId" })
    district: District;

    @Column({ nullable: true })
    districtId: number;

    @Column({ nullable: true })
    businessRegNumber: string;

    @Column({ type: "varchar", nullable: true })
    taxNumber: string;

    @Column("text", { array: true, nullable: true })
    taxDocuments: string[];

    @Column("text", { array: true, nullable: true })
    citizenshipDocuments: string[];

    @Column({ type: "varchar", nullable: true })
    chequePhoto: string; // hataune

    @Column({ type: "varchar", nullable: true })
    accountName: string;

    @Column({ type: "varchar", nullable: true })
    bankName: string;

    @Column({ type: "varchar", nullable: true })
    accountNumber: string;

    @Column({ type: "varchar", nullable: true })
    bankBranch: string;

    @Column({ nullable: true })
    verificationCode: string | null;

    @Column({ nullable: true })
    verificationCodeExpire: Date | null;

    @Column({ default: false })
    isVerified: boolean;

    @Column({ default: false })
    isApproved: boolean;

    // Broadcast campaign email only; transactional mail ignores it.
    @Column({ type: "boolean", default: true })
    marketingEmailsEnabled: boolean;

    @Column({ type: "timestamp", nullable: true })
    deletionRequestedAt: Date | null;

    @Column({ type: "timestamp", nullable: true })
    deletionScheduledFor: Date | null;

    @Column({ type: "timestamp", nullable: true })
    deletionFinalizedAt: Date | null;

    @Column({ type: "boolean", nullable: true })
    deletionPreviousApproval: boolean | null;

    @Column({ nullable: true })
    resetToken: string | null;

    @Column({ nullable: true })
    resetTokenExpire: Date | null;

    @Column({ default: 0 })
    resendCount: number;

    @Column({ nullable: true })
    resendBlockUntil: Date | null;

    @Column({ nullable: true })
    fcmToken?: string;

    @Column({ nullable: true })
    profilePicture?: string;

    @OneToMany(() => Product, (product) => product.vendor)
    products: Product[];

    @OneToMany(() => OrderItem, (orderItem) => orderItem.product)
    orderItems: OrderItem[];

    @OneToMany(
        () => VendorPaymentOption,
        (paymentOption) => paymentOption.vendor,
        {
            cascade: true,
        },
    )
    paymentOptions?: VendorPaymentOption[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    /**
     * Every token issued before this moment is refused.
     *
     * Set on a password change or reset, and by an admin ending all sessions.
     * One write revokes an unbounded number of tokens, including ones that were
     * never presented to us. Null means nothing has been revoked, which is the
     * state of every account that predates this column.
     */
    @Column({ type: "timestamp", nullable: true })
    tokensValidFrom?: Date | null;
}
