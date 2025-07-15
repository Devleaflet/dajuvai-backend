import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { User } from "./user.entity";
import { Product } from "./product.entity";


@Entity('reviews')
export class Review {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('decimal', { precision: 2, scale: 1 })
    rating: number;

    @Column('text')
    comment: string;

    @ManyToOne(() => User, { onDelete: 'SET NULL' })
    @JoinColumn({ name: 'userId' })
    user: User;

    @Column()
    userId: number;

    @ManyToOne(() => Product, (product) => product.reviews, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'productId' })
    product: Product;

    @Column()
    productId: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}