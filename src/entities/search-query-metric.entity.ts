import { Column, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity("search_query_metrics")
@Index("uq_search_query_metric", ["normalizedQuery", "locale", "dayBucket"], { unique: true })
export class SearchQueryMetric {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: "normalized_query", type: "text" })
  normalizedQuery: string;

  @Column({ type: "varchar", length: 16, default: "und" })
  locale: string;

  @Column({ name: "day_bucket", type: "date" })
  dayBucket: string;

  @Column({ name: "search_count", type: "integer", default: 0 })
  searchCount: number;

  @Column({ name: "zero_result_count", type: "integer", default: 0 })
  zeroResultCount: number;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
