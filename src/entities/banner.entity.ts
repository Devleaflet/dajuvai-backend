import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToMany, JoinTable } from 'typeorm';
import { User } from './user.entity';
import { Product } from './product.entity';
import { Category } from './category.entity';
import { Subcategory } from './subcategory.entity';
import { Deal } from './deal.entity';

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

export enum ProductSource {
    MANUAL = 'manual',
    CATEGORY = 'category',
    SUBCATEGORY = 'subcategory',
    DEAL = 'deal',
    EXTERNAL = 'external'
}

@Entity('banners')
export class Banner {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    name: string;

    @Column({ nullable: true })
    desktopImage: string;

    @Column({ nullable: true })
    mobileImage: string;

    @Column({ type: 'enum', enum: BannerType })
    type: BannerType;

    @Column({ type: 'enum', enum: BannerStatus, default: BannerStatus.SCHEDULED })
    status: BannerStatus;

    @Column({ type: 'timestamp' })
    startDate: Date;

    @Column({ type: 'timestamp' })
    endDate: Date;
    
    @Column({ type: 'enum', enum: ProductSource, nullable: true })
    productSource: ProductSource;
    
    @ManyToMany(() => Product)
    @JoinTable({
        name: 'banner_products',
        joinColumn: { name: 'bannerId', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'productId', referencedColumnName: 'id' }
    })
    selectedProducts: Product[];
    
    @ManyToOne(() => Category, { nullable: true })
    @JoinColumn({ name: 'selectedCategoryId' })
    selectedCategory: Category;
    
    @ManyToOne(() => Subcategory, { nullable: true })
    @JoinColumn({ name: 'selectedSubcategoryId' })
    selectedSubcategory: Subcategory;
    
    @ManyToOne(() => Deal, { nullable: true })
    @JoinColumn({ name: 'selectedDealId' })
    selectedDeal: Deal;
    
    @Column({ nullable: true })
    externalLink: string;

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