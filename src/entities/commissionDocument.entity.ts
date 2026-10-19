import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { User } from "./user.entity";

@Entity("commission_documents")
export class CommissionDocument {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column()
  fileUrl: string;

  @Column({ nullable: true })
  fileName?: string;

  // Only one row is active at a time - the document vendors currently see.
  // Older rows are kept (isActive = false) as an upload history/audit trail.
  // Indexed here because migration 1775385055804 created the index: without the
  // decorator TypeORM does not know it exists and `migration:generate` emits a
  // DROP for it that is never paired with a re-CREATE.
  @Index("IDX_commission_documents_isActive")
  @Column({ default: true })
  isActive: boolean;

  @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "uploadedById" })
  uploadedBy?: User;

  @Column({ nullable: true })
  uploadedById?: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
