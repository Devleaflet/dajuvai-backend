import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { AttributeType } from "./attributeType.entity";

@Entity('attribute_values')
export class AttributeValue {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    value: string; // e.g., "Small", "Red"

    @ManyToOne(() => AttributeType, (type) => type.values, { onDelete: "CASCADE" })
    @JoinColumn({ name: "attributeTypeId" })
    attributeType: AttributeType;

    @Column()
    attributeTypeId: number;
}