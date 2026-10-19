import { DataSource } from "typeorm";
import { SearchAliasCandidate, SearchOutcomeType, SearchTargetType } from "../entities/search-alias-candidate.entity";
import { normalizeSearchQuery } from "../search/normalize-search-query";

export const shouldCreateSearchAliasCandidate = ({
  searches,
  positiveOutcomes,
}: { searches: number; positiveOutcomes: number }): boolean =>
  searches >= 5 && positiveOutcomes / searches >= 0.2;

export class SearchLearningService {
  constructor(private readonly dataSource: DataSource) {}

  async recordSearch(input: { normalizedQuery: string; resultCount: number; locale?: string }): Promise<void> {
    const normalizedQuery = normalizeSearchQuery(input.normalizedQuery);
    if (!normalizedQuery) return;
    const locale = input.locale?.slice(0, 16) || "und";
    await this.dataSource.query(`
      INSERT INTO "search_query_metrics"
        ("normalized_query", "locale", "day_bucket", "search_count", "zero_result_count")
      VALUES ($1, $2, CURRENT_DATE, 1, $3)
      ON CONFLICT ("normalized_query", "locale", "day_bucket") DO UPDATE
      SET "search_count" = "search_query_metrics"."search_count" + 1,
          "zero_result_count" = "search_query_metrics"."zero_result_count" + EXCLUDED."zero_result_count",
          "updated_at" = now()
    `, [normalizedQuery, locale, input.resultCount === 0 ? 1 : 0]);
  }

  async recordOutcome(input: {
    normalizedQuery: string;
    targetType: SearchTargetType;
    targetId: number;
    outcome: SearchOutcomeType;
  }): Promise<void> {
    const normalizedQuery = normalizeSearchQuery(input.normalizedQuery);
    if (!normalizedQuery || !Number.isInteger(input.targetId) || input.targetId <= 0) return;
    const [metric] = await this.dataSource.query(`
      SELECT COALESCE(SUM("search_count"), 0)::integer AS "searchCount"
      FROM "search_query_metrics"
      WHERE "normalized_query" = $1
    `, [normalizedQuery]) as Array<{ searchCount: number | string }>;
    const searchCount = Number(metric?.searchCount ?? 0);
    const repository = this.dataSource.getRepository(SearchAliasCandidate);
    const existing = await repository.findOneBy({
      normalizedQuery,
      targetType: input.targetType,
      targetId: input.targetId,
    });
    const positiveOutcomeCount = (existing?.positiveOutcomeCount ?? 0) + 1;
    if (!shouldCreateSearchAliasCandidate({ searches: searchCount, positiveOutcomes: positiveOutcomeCount })) return;
    await repository.save(repository.create({
      ...existing,
      normalizedQuery,
      targetType: input.targetType,
      targetId: input.targetId,
      positiveOutcomeCount,
      searchCount,
      confidence: String(positiveOutcomeCount / searchCount),
      active: false,
    }));
  }
}
