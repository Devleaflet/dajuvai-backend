import {
    Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
    Index, Unique, CreateDateColumn, UpdateDateColumn,
} from "typeorm";
import { Category } from "./category.entity";
import { Placement } from "./placement.entity";

/**
 * Where and how one category appears in one placement. All presentation state
 * lives here so the Category table stays a pure catalog record.
 */
@Entity("category_placement")
@Unique("UQ_category_placement", ["categoryId", "placementCode"])
@Index("IDX_category_placement_read", ["placementCode", "pinned", "displayOrder"])
export class CategoryPlacement {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    categoryId: number;

    @ManyToOne(() => Category, { onDelete: "CASCADE" })
    @JoinColumn({ name: "categoryId" })
    category: Category;

    @Column({ type: "varchar", length: 64 })
    placementCode: string;

    @ManyToOne(() => Placement, { onDelete: "CASCADE" })
    @JoinColumn({ name: "placementCode", referencedColumnName: "code" })
    placement: Placement;

    @Column({ type: "int", default: 0 })
    displayOrder: number;

    @Column({ type: "boolean", default: true })
    visible: boolean;

    /** Affects design (large card), not order. */
    @Column({ type: "boolean", default: false })
    featured: boolean;

    /** Affects order (floats above unpinned), not design. */
    @Column({ type: "boolean", default: false })
    pinned: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
