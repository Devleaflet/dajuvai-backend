

import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, OneToMany, JoinColumn, Index } from 'typeorm';
import { Category } from './category.entity';
import { User } from './user.entity';
import { Product } from './product.entity';


@Entity()
export class Subcategory {
    @PrimaryGeneratedColumn()
    id: number;

    /** URL identifier derived from the name. Assigned by `SlugSubscriber`; never written directly. */
    @Index("UQ_subcategory_slug", { unique: true })
    @Column({ type: "varchar", length: 128 })
    slug: string;

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