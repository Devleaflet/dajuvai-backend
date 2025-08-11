// import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
// import { ProductVariant } from "./productVariant.entity";
// import { AttributeValue } from "./attributeValue.entity";

// @Entity('variant_attributes')
// export class VariantAttribute {
//     @PrimaryGeneratedColumn()
//     id: number;

//     @ManyToOne(() => ProductVariant, (variant) => variant.attributes, { onDelete: "CASCADE" })
//     @JoinColumn({ name: "variantId" })
//     variant: ProductVariant;

//     @Column()
//     variantId: number;

//     @ManyToOne(() => AttributeValue, { onDelete: "CASCADE" })
//     @JoinColumn({ name: "attributeValueId" })
//     attributeValue: AttributeValue;

//     @Column()
//     attributeValueId: number;
// }