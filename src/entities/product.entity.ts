import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { Subcategory } from "./subcategory.entity";
import { Vendor } from "./vendor.entity";
import { Brand } from "./brand.entity";
import { Deal } from "./deal.entity";
import { Review } from "./reviews.entity";
import { OrderItem } from "./orderItems.entity";
import { User } from "./user.entity";
import { Banner } from "./banner.entity";

export enum DiscountType {
    PERCENTAGE = 'PERCENTAGE',
    FLAT = 'FLAT',
}

export enum InventoryStatus {
    AVAILABLE = 'AVAILABLE',
    OUT_OF_STOCK = 'OUT_OF_STOCK',
    LOW_STOCK = 'LOW_STOCK',
}


@Entity('products')
export class Product {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column('text')
    description: string;

    @Column('decimal', { precision: 8, scale: 2 })
    basePrice: number;

    @Column()
    stock: number;

    @Column('decimal', { precision: 5, scale: 2, default: 0, nullable: true })
    discount: number;

    @Column({ type: 'enum', enum: DiscountType, default: DiscountType.PERCENTAGE, nullable: true })
    discountType: DiscountType;

    @Column('simple-array', { nullable: true })
    size: string[];

    @Column('simple-array', { nullable: true })
    productImages: string[];

    // @Column('simple-array', { nullable: true })
    // inventory: { sku: string; quantity: number; status: InventoryStatus }[];
    @Column({ type: 'enum', enum: InventoryStatus, default: InventoryStatus.AVAILABLE, nullable: true })
    status: InventoryStatus

    @Column({ nullable: true })
    quantity: number

    @ManyToOne(() => Subcategory, (subcategory) => subcategory.products, { onDelete: "CASCADE" })
    @JoinColumn({ name: "subcategory_id" })
    subcategory: Subcategory;

    @ManyToOne(() => Vendor, (vendor) => vendor.products)
    @JoinColumn({ name: 'vendorId' })
    vendor: Vendor;

    @Column({ nullable: true })
    vendorId: number;

    @ManyToOne(() => User, (user) => user.products_admin)
    @JoinColumn({ name: "userId" })
    user: User;

    @Column({ nullable: true })
    userId: number;

    @ManyToOne(() => Brand, (brand) => brand.products, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'brand_id' })
    brand: Brand;

    @Column({ nullable: true })
    brand_id: number;

    @ManyToOne(() => Deal, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'dealId' })
    deal: Deal;

    @Column({ nullable: true })
    dealId: number;

    @OneToMany(() => Review, (review) => review.product)
    reviews: Review[];

    @OneToMany(() => OrderItem, (orderItem) => orderItem.product)
    orderItems: OrderItem[];

    @ManyToOne(() => Banner, (banner) => banner.products, { onDelete: 'SET NULL', nullable: true })
    @JoinColumn({ name: "bannerId" })
    banner: Banner;

    @Column({ nullable: true })
    bannerId: number;

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}