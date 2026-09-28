import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn, Index } from "typeorm";
import { User } from "./user.entity";
import { Product } from "./product.entity";

export enum DealStatus {
    ENABLED = 'ENABLED',
    DISABLED = 'DISABLED',
}

@Entity('deals')
export class Deal {
    @PrimaryGeneratedColumn()
    id: number;

    /** URL identifier derived from the name. Assigned by `SlugSubscriber`; never written directly. */
    @Index("UQ_deals_slug", { unique: true })
    @Column({ type: "varchar", length: 128 })
    slug: string;

    @Column()
    name: string;

    @Column("decimal", { precision: 5, scale: 2 })
    discountPercentage: number;

    @Column({ type: 'enum', enum: DealStatus, default: DealStatus.DISABLED })
    status: DealStatus;

    @OneToMany(() => Product, (product) => product.deal)
    products: Product[];

    @ManyToOne(() => User, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'createdById' })
    createdBy: User;

    @Column()
    createdById: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}