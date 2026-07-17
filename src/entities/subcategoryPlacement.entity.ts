import {
    Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
    Index, Unique, CreateDateColumn, UpdateDateColumn,
} from "typeorm";
import { Subcategory } from "./subcategory.entity";
import { Placement } from "./placement.entity";

/** Where and how one subcategory appears in one placement. */
@Entity("subcategory_placement")
@Unique("UQ_subcategory_placement", ["subcategoryId", "placementCode"])
@Index("IDX_subcategory_placement_read", ["placementCode", "pinned", "displayOrder"])
export class SubcategoryPlacement {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    subcategoryId: number;

    @ManyToOne(() => Subcategory, { onDelete: "CASCADE" })
    @JoinColumn({ name: "subcategoryId" })
    subcategory: Subcategory;

    @Column({ type: "varchar", length: 64 })
    placementCode: string;

    @ManyToOne(() => Placement, { onDelete: "CASCADE" })
    @JoinColumn({ name: "placementCode", referencedColumnName: "code" })
    placement: Placement;

    @Column({ type: "int", default: 0 })
    displayOrder: number;

    @Column({ type: "boolean", default: true })
    visible: boolean;

    @Column({ type: "boolean", default: false })
    featured: boolean;

    @Column({ type: "boolean", default: false })
    pinned: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
