import { Column, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Product } from "./product.entity";
import { ProductSource } from "./banner.entity";
import { Category } from "./category.entity";
import { Subcategory } from "./subcategory.entity";
import { Deal } from "./deal.entity";


@Entity('homepage_section')
export class HomePageSection {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ unique: true })
    title: string; // examples: best of oils, best of <product>

    @Column({ default: true })
    isActive: boolean;

    @Column({ type: "enum", enum: ProductSource })
    productSource: ProductSource

    @ManyToMany(() => Product)
    @JoinTable({
        name: 'homepage_section_products',
        joinColumn: { name: 'sectionId', referencedColumnName: 'id' },
        inverseJoinColumn: { name: 'productId', referencedColumnName: 'id' }
    })
    products: Product[];

    @ManyToOne(() => Category, { nullable: true })
    @JoinColumn({ name: 'selectedCategoryId' })
    selectedCategory: Category;

    @ManyToOne(() => Subcategory, { nullable: true })
    @JoinColumn({ name: 'selectedSubcategoryId' })
    selectedSubcategory: Subcategory;

    @ManyToOne(() => Deal, { nullable: true })
    @JoinColumn({ name: 'selectedDealId' })
    selectedDeal: Deal;

}
