import { Column, Entity, ManyToOne, OneToMany, PrimaryGeneratedColumn, JoinColumn } from "typeorm";
import { Product } from "./product.entity";
import { AttributeValue } from "./attributeValue.entity";

@Entity('attribute_types')
export class AttributeType {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    name: string; // e.g., "Size", "Color"

    @ManyToOne(() => Product, (product) => product.attributeTypes, { onDelete: "CASCADE" })
    @JoinColumn({ name: "productId" })
    product: Product;

    @Column()
    productId: number;

    @OneToMany(() => AttributeValue, (value) => value.attributeType)
    values: AttributeValue[];
}