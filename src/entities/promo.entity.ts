import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export enum PromoType {
    LINE_TOTAL = "LINE_TOTAL",
    SHIPPING = "SHIPPING",
}

@Entity()
export class Promo {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    promoCode: string;

    @Column({ type: "int" })
    discountPercentage: number;

    @Column({
        type: "enum",
        enum: PromoType,
        default: PromoType.LINE_TOTAL,
    })
    applyOn: PromoType;

    @Column({ type: "boolean", nullable: true, default: true })
    isValid: boolean;

    @Column({ type: "int", default: 0 })
    maxUsageCount: number;

    @Column({ type: "int", default: 0 })
    usageCount: number;

    /**
     * How many times one customer may use this code. 0 means unlimited,
     * matching how `maxUsageCount` already reads.
     *
     * Enforced against the PromoRedemption ledger inside the same transaction
     * that claims the global slot, so the two caps cannot disagree.
     */
    @Column({ type: "int", default: 0 })
    maxUsagePerUser: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}