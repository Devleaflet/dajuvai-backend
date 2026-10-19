import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    OneToMany,
    CreateDateColumn,
    UpdateDateColumn,
    Index,
} from "typeorm";
import { Product } from "./product.entity";

@Entity("brands")
export class Brand {
    @PrimaryGeneratedColumn()
    id: number;

    /** URL identifier derived from the name. Assigned by `SlugSubscriber`; never written directly. */
    @Index("UQ_brands_slug", { unique: true })
    @Column({ type: "varchar", length: 128 })
    slug: string;

    @Column({ unique: true })
    name: string;

    // @OneToMany(() => Product, product => product.brand)
    // products: Product[];

    @CreateDateColumn()
    created_at: Date;

    @UpdateDateColumn()
    updated_at: Date;
}
