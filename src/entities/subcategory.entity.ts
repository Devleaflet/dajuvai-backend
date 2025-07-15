

import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, OneToMany, JoinColumn } from 'typeorm';
import { Category } from './category.entity';
import { User } from './user.entity';
import { Product } from './product.entity';


@Entity()
export class Subcategory {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    name: string;

    @Column({ nullable: true })
    image: string;

    @ManyToOne(() => User)
    createdBy: User;

    @ManyToOne(() => Category, (category) => category.subcategories)
    category: Category;

    @OneToMany(() => Product, (product) => product.subcategory)
    products: Product[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}