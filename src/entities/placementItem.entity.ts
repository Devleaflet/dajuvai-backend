import {
    Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
    Index, Unique, CreateDateColumn, UpdateDateColumn,
} from "typeorm";
import { Placement } from "./placement.entity";

export type PlacementEntityType = "category" | "subcategory";

/**
 * One catalog item (category or subcategory) placed into one placement, in
 * one order, visible or not. entity_id is polymorphic (points at Category.id
 * or Subcategory.id depending on entityType) so it deliberately carries no FK
 * of its own - only placementId is a real foreign key.
 */
@Entity("placement_items")
@Unique("UQ_placement_items_entity", ["placementId", "entityType", "entityId"])
@Index("IDX_placement_items_order", ["placementId", "entityType", "displayOrder"])
export class PlacementItem {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    placementId: number;

    @ManyToOne(() => Placement, { onDelete: "CASCADE" })
    @JoinColumn({ name: "placementId" })
    placement: Placement;

    @Column({ type: "varchar", length: 20 })
    entityType: PlacementEntityType;

    @Column()
    entityId: number;

    @Column({ type: "int", default: 0 })
    displayOrder: number;

    @Column({ type: "boolean", default: true })
    visible: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
