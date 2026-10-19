import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

export type SearchAliasSource = "CURATED" | "ADMIN" | "SEARCH_LOG" | "PRODUCT_DATA";

@Entity("search_aliases")
@Index("idx_search_alias_normalized", ["normalizedAlias", "normalizedCanonical"])
export class SearchAlias {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "canonical_term", type: "text" })
  canonicalTerm: string;

  @Column({ name: "normalized_canonical", type: "text" })
  normalizedCanonical: string;

  @Column({ type: "text" })
  alias: string;

  @Column({ name: "normalized_alias", type: "text" })
  normalizedAlias: string;

  @Column({ name: "category_id", type: "integer", nullable: true })
  categoryId: number | null;

  @Column({ name: "subcategory_id", type: "integer", nullable: true })
  subcategoryId: number | null;

  @Column({ type: "varchar", length: 16, nullable: true })
  locale: string | null;

  @Column({ type: "varchar", length: 20 })
  source: SearchAliasSource;

  @Column({ type: "numeric", precision: 4, scale: 3 })
  confidence: string;

  @Column({ type: "boolean", default: false })
  active: boolean;

  @Column({ name: "approved_at", type: "timestamptz", nullable: true })
  approvedAt: Date | null;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
