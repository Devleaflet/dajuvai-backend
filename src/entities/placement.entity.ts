import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

/**
 * A surface where catalog items can be shown (mega menu, homepage, …).
 *
 * Deliberately a table and not a TS enum: a new placement must be an INSERT,
 * never a deploy. The primary key IS the code, so placement rows reference a
 * readable string rather than an opaque id.
 */
@Entity("placement")
export class Placement {
    @PrimaryColumn({ type: "varchar", length: 64 })
    code: string;

    @Column({ type: "varchar", length: 128 })
    label: string;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @Column({ type: "int", default: 0 })
    sortOrder: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
