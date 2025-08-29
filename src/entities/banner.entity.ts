import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { Product } from './product.entity';

export enum BannerType {
    HERO = 'HERO',
    SIDEBAR = 'SIDEBAR',
    PRODUCT = 'PRODUCT',
    SPECIAL_DEALS = 'SPECIAL_DEALS',
}

export enum BannerStatus {
    SCHEDULED = 'SCHEDULED',
    ACTIVE = 'ACTIVE',
    EXPIRED = 'EXPIRED',
}

@Entity('banners')
export class Banner {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    name: string;

    @Column({ nullable: true })
    image: string;

    @Column({ type: 'enum', enum: BannerType })
    type: BannerType;

    @Column({ type: 'enum', enum: BannerStatus, default: BannerStatus.SCHEDULED })
    status: BannerStatus;

    @Column({ type: 'timestamp' })
    startDate: Date;

    @Column({ type: 'timestamp' })
    endDate: Date;

    @ManyToOne(() => User, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'createdById' })
    createdBy: User;

    @OneToMany(() => Product, (product) => product.banner)
    products: Product[];

    @Column()
    createdById: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}