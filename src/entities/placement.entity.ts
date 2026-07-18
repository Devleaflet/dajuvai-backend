import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

export type PlacementStatus = "active" | "inactive";

/** A surface where catalog items can be arranged (mega menu, category grid, ...). */
@Entity("placements")
export class Placement {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: "varchar", length: 100 })
    name: string;

    @Column({ type: "varchar", length: 100, unique: true })
    slug: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    description: string | null;

    @Column({ type: "varchar", length: 20, default: "active" })
    status: PlacementStatus;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
