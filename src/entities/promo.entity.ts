import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

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

}