import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from "typeorm";
import { CartItem } from "./cartItem.entity";

@Entity('carts')
export class Cart {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    userId: number;

    @Column('decimal', { precision: 10, scale: 2, default: 0 })
    total: number;

    @OneToMany(() => CartItem, (item) => item.cart, { cascade: true, eager: true }) // eager: true -> automatically load items
    items: CartItem[];
}