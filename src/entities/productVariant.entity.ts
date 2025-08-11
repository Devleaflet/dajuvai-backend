// import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from "typeorm";
// import { Product } from "./product.entity";
// import { VariantAttribute } from "./variantAttribute.entity";
// import { VariantImage } from "./variantImages.entity";
// import { InventoryStatus } from "./product.enum";

// @Entity('product_variants')
// export class ProductVariant {
//     @PrimaryGeneratedColumn()
//     id: number;

//     @Column()
//     sku: string;

//     @Column('decimal', { precision: 8, scale: 2 })
//     price: number;

//     @Column()
//     stock: number;

//     @Column({ type: 'enum', enum: InventoryStatus, default: InventoryStatus.AVAILABLE })
//     status: InventoryStatus;

//     @ManyToOne(() => Product, (product) => product.variants, { onDelete: "CASCADE" })
//     @JoinColumn({ name: "productId" })
//     product: Product;

//     @Column()
//     productId: number;

//     @OneToMany(() => VariantAttribute, (attribute) => attribute.variant)
//     attributes: VariantAttribute[];

//     @OneToMany(() => VariantImage, (image) => image.variant)
//     images: VariantImage[];
// }