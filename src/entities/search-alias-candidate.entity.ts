import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

export type SearchOutcomeType = "CLICK" | "ADD_TO_CART" | "PURCHASE";
export type SearchTargetType = "PRODUCT" | "CATEGORY" | "SUBCATEGORY";

@Entity("search_alias_candidates")
@Index("uq_search_alias_candidate", ["normalizedQuery", "targetType", "targetId"], { unique: true })
export class SearchAliasCandidate {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "normalized_query", type: "text" })
  normalizedQuery: string;

  @Column({ name: "target_type", type: "varchar", length: 16 })
  targetType: SearchTargetType;

  @Column({ name: "target_id", type: "integer" })
  targetId: number;

  @Column({ name: "search_count", type: "integer", default: 0 })
  searchCount: number;

  @Column({ name: "positive_outcome_count", type: "integer", default: 0 })
  positiveOutcomeCount: number;

  @Column({ type: "numeric", precision: 4, scale: 3, default: 0 })
  confidence: string;

  @Column({ type: "boolean", default: false })
  active: boolean;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
