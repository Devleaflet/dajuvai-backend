import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Product } from "./product.entity";
import { Wishlist } from "./wishlist.entity";
import { Variant } from "./variant.entity";

@Entity('wishlist_items')
export class WishlistItem {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Wishlist, (wishlist) => wishlist.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'wishlist_id' })
    wishlist: Wishlist;

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