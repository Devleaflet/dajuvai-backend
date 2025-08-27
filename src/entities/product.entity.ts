import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, JoinColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";
import { Subcategory } from "./subcategory.entity";
import { Vendor } from "./vendor.entity";
import { Deal } from "./deal.entity";
import { Banner } from "./banner.entity";
import { DiscountType, InventoryStatus } from "./product.enum";
import { OrderItem } from "./orderItems.entity";
import { Brand } from "./brand.entity";
import { Review } from "./reviews.entity";
import { Variant } from "./variant.entity";

@Entity('products')
export class Product {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string;

    @Column({ nullable: true })
    description?: string;

    // Only used if hasVariants = false
    @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
    basePrice?: number;

    @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
    discount: number;

    @Column({ type: 'enum', enum: DiscountType, default: DiscountType.PERCENTAGE })
    discountType: DiscountType;

    @Column({ type: 'enum', enum: InventoryStatus, default: InventoryStatus.AVAILABLE, nullable: true })
    status?: InventoryStatus;

    @Column({ nullable: true })
    stock?: number;

    @ManyToOne(() => Subcategory, { onDelete: "SET NULL" })
    @JoinColumn({ name: "subcategoryId" })
    subcategory: Subcategory;

    @Column({ nullable: true })
    subcategoryId: number;

    @ManyToOne(() => Vendor, { onDelete: "CASCADE" })
    @JoinColumn({ name: "vendorId" })
    vendor: Vendor;

    @Column()
    vendorId: number;

    @ManyToOne(() => Deal, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "dealId" })
    deal?: Deal;

    @Column({ nullable: true })
    dealId?: number;

    @ManyToOne(() => Banner, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "bannerId" })
    banner?: Banner;

    @Column({ nullable: true })
    bannerId?: number;

    @Column({ type: 'text', array: true, nullable: true })
    productImages?: string[];

    @OneToMany(() => OrderItem, (orderItem) => orderItem.product)
    orderItems: OrderItem[];

    @ManyToOne(() => Brand, (brand) => brand.products, { onDelete: "SET NULL" })
    brand: Brand;

    @Column({ type: "text", array: true, nullable: true })
    size?: string[];

    @Column({ nullable: true })
    brandId?: number;

    @Column({ type: 'boolean', default: false })
    hasVariants: boolean;

    @OneToMany(() => Variant, (variant) => variant.product, { cascade: true })
    variants: Variant[];

    @OneToMany(() => Review, (review) => review.product, { cascade: true })
    reviews: Review[];

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}

// @OneToMany(() => ProductVariant, (variant) => variant.product)
// variants?: ProductVariant[];

// @OneToMany(() => VariantImage, (image) => image.product)
// productImages?: VariantImage[];

// @OneToMany(() => AttributeType, (attributeType) => attributeType.product)
// attributeTypes: AttributeType[];
// @Column()
// hasVariants?: boolean;