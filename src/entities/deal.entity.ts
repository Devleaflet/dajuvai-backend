import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";

export enum DealStatus {
    ENABLED = 'ENABLED',
    DISABLED = 'DISABLED',
}

@Entity('deals')
export class Deal {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column("decimal", { precision: 5, scale: 2 })
    discountPercentage: number;

    @Column({ type: 'enum', enum: DealStatus, default: DealStatus.DISABLED })
    status: DealStatus;

    @ManyToOne(() => User, { onDelete: 'SET NULL' }) // if admin is deleted from user entity, the createdBy field will be set to null instead of deleting deal created by user
    @JoinColumn({ name: 'createdById' })
    createdBy: User;

    @Column()
    createdById: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}