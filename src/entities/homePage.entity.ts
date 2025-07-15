import { Column, Entity, JoinTable, ManyToMany, PrimaryGeneratedColumn } from "typeorm";
import { Product } from "./product.entity";

@Entity('homepage_section')
export class HomePageSection {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    title: string; // examples: best of oils, best of <product>

    @Column({ default: true })
    isActive: boolean;

    @ManyToMany(() => Product) // one product can be in multiple section like bet of oils , latest arrivals
    @JoinTable()
    products: Product[];
}
