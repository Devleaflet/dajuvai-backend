import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Product } from "./product.entity";
import { Wishlist } from "./wishlist.entity";

@Entity('wishlist_items')
export class WishlistItem {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Wishlist, (wishlist) => wishlist.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'wishlist_id' })
    wishlist: Wishlist;

    @ManyToOne(() => Product, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'product_id' })
    product: Product;

    @Column()
    productId: number;

    @CreateDateColumn()
    createdAt: Date;
}