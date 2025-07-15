import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Promo {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    promoCode: string;

    @Column({ type: "int" })
    discountPercentage: number;
}