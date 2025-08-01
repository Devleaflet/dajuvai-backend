import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Product } from "./product.entity";
import { ProductVariant } from "./productVariant.entity";

@Entity('variant_images')
export class VariantImage {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    imageUrl: string;

    @ManyToOne(() => Product, (product) => product.productImages, { onDelete: "CASCADE", nullable: true })
    @JoinColumn({ name: "productId" })
    product: Product;

    @Column({ nullable: true })
    productId: number;

    @ManyToOne(() => ProductVariant, (variant) => variant.images, { onDelete: "CASCADE", nullable: true })
    @JoinColumn({ name: "variantId" })
    variant: ProductVariant;

    @Column({ nullable: true })
    variantId: number;
}