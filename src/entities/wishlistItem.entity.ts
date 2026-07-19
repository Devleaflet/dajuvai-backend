import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Product } from "./product.entity";
import { Wishlist } from "./wishlist.entity";
import { Variant } from "./variant.entity";

@Entity('wishlist_items')
@Index('IDX_wishlist_items_product_unique', ['wishlistId', 'productId'], {
    unique: true,
    where: '"variantId" IS NULL',
})
@Index('IDX_wishlist_items_variant_unique', ['wishlistId', 'productId', 'variantId'], {
    unique: true,
    where: '"variantId" IS NOT NULL',
})
export class WishlistItem {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Wishlist, (wishlist) => wishlist.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'wishlist_id' })
    wishlist: Wishlist;

    @Column({ name: 'wishlist_id' })
    wishlistId: number;

    @ManyToOne(() => Product, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'product_id' })
    product: Product;

    @ManyToOne(() => Variant, { nullable: true, onDelete:"CASCADE" })
    @JoinColumn({ name: 'variantId' })
    variant?: Variant;

    @Column({ nullable: true })
    variantId?: number;

    @Column()
    productId: number;

    @CreateDateColumn()
    createdAt: Date;
}
