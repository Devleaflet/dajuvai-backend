import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { Product } from './product.entity';
import { WishlistItem } from './wishlistItem.entity';

@Entity('wishlists')
export class Wishlist {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    userId: number;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: 'userId' })
    user: User;

    @OneToMany(() => WishlistItem, (item) => item.wishlist, { cascade: true })
    items: WishlistItem[];
}
