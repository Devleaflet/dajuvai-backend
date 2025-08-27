import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { Product } from './product.entity';
import { Cart } from './cart.entity';
import { Variant } from './variant.entity';

@Entity('cart_items')
export class CartItem {
    @PrimaryGeneratedColumn()
    id: number;

    @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'cart_id' })
    cart: Cart;

    @ManyToOne(() => Product, {onDelete:"CASCADE"})
    @JoinColumn({ name: 'product_id' })
    product: Product;

    @Column()
    quantity: number;

    @Column('decimal', { precision: 8, scale: 2 })
    price: number;

    @Column()
    name: string;

    @Column('text')
    description: string;


    @Column({ nullable: true })
    image: string;

    @ManyToOne(() => Variant, { nullable: true })
    @JoinColumn({ name: 'variant_id' })
    variant?: Variant;

    @Column({ nullable: true })
    variantId: number | null;
}

