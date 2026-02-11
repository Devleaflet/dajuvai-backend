import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    Unique,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Vendor } from './vendor.entity';

export enum PaymentOption {
    ESEWA = 'ESEWA',
    KHALTI = 'KHALTI',
    IMEPAY = 'IMEPAY',
    FONEPAY = 'FONEPAY',
    NPS = 'NPS',
}

@Entity()
@Unique(['vendorId', 'paymentType'])
export class VendorPaymentOption {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({
        type: 'enum',
        enum: PaymentOption,
    })
    paymentType: PaymentOption;

    /**
     * For WALLET (ESEWA, KHALTI, IMEPAY):
     * {
     *   walletNumber: string,
     *   accountName?: string
     * }
     *
     * For BANK (NPS):
     * {
     *   accountNumber: string,
     *   bankName: string,
     *   accountName?: string,
     *   branch?: string
     * }
     */
    @Column({ type: 'jsonb', nullable: true })
    details: Record<string, any>;

    @Column({ nullable: true })
    qrCodeImage: string;

    @Column({ default: true })
    isActive: boolean;

    @ManyToOne(() => Vendor, (vendor) => vendor.paymentOptions, {
        nullable: true,
        onDelete: 'CASCADE',
    })
    @JoinColumn({ name: 'vendorId' })
    vendor?: Vendor;

    @Column({ nullable: true })
    vendorId?: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
