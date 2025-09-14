import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, PrimaryGeneratedColumn } from "typeorm";
import { DiscountType, InventoryStatus } from "./product.enum";
import { Product } from "./product.entity";

@Entity('variants')
export class Variant {
    @PrimaryGeneratedColumn()
    id: string;

    @Column({ type: 'varchar', length: 100 })
    sku: string;

    @Column({ type: 'decimal', precision: 8, scale: 2 })
    basePrice: number;

    @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
    finalPrice: number; 

    @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
    discount: number;

    @Column({ type: 'enum', enum: DiscountType, default: DiscountType.PERCENTAGE })
    discountType: DiscountType;

    @Column({ type: 'jsonb', nullable: true })
    attributes: { [key: string]: string };

    @Column({ type: 'text', array: true, default: '{}' })
    variantImages: string[];

    @Column({ type: 'integer' })
    stock: number;

    @Column({ type: 'enum', enum: InventoryStatus, default: InventoryStatus.AVAILABLE, nullable: true })
    status?: InventoryStatus;

    @Column({ type: 'varchar', length: 255 })
    productId: string;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
    created_at: Date;

    @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
    updated_at: Date;

    @ManyToOne(() => Product, (product) => product.variants, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'product_id' })
    product: Product;
}