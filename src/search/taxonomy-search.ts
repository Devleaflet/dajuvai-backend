import {
  buildSearchCandidates,
  normalizeSearchQuery,
} from "./normalize-search-query";

export interface TaxonomySearchCondition {
  where: string;
  score: string;
  parameters: Record<string, string | number>;
}

export function buildTaxonomySearchCondition(
  input: string,
  fields: {
    category: string;
    subcategory: string;
    brand: string;
    keyword: string;
  },
): TaxonomySearchCondition | undefined {
  const query = normalizeSearchQuery(input);
  if (!query) return undefined;

  const candidates = buildSearchCandidates(query);
  const parameters: Record<string, string | number> = {
    taxonomyExact: query,
    taxonomyPrefix: `${query}%`,
    taxonomyLike: `%${query}%`,
    taxonomySimilarityThreshold: query.length < 5 ? 0.35 : 0.25,
  };

  const conditions = candidates.map((candidate, index) => {
    const key = `taxonomyCandidate${index}`;
    parameters[key] = `%${candidate}%`;
    return `(
      LOWER(${fields.category}) LIKE :${key}
      OR LOWER(${fields.subcategory}) LIKE :${key}
      OR LOWER(${fields.brand}) LIKE :${key}
      OR LOWER(${fields.keyword}) LIKE :${key}
    )`;
  });

  const searchableFields = [
    fields.category,
    fields.subcategory,
    fields.brand,
    fields.keyword,
  ];
  const fieldMatches = searchableFields
    .flatMap((field) => [
      `LOWER(${field}) = :taxonomyExact`,
      `LOWER(${field}) LIKE :taxonomyPrefix`,
      `LOWER(${field}) LIKE :taxonomyLike`,
      `similarity(LOWER(${field}), :taxonomyExact) >= :taxonomySimilarityThreshold`,
    ])
    .join(" OR ");

  return {
    where: `(${fieldMatches} OR ${conditions.join(" OR ")})`,
    score: `CASE
      WHEN LOWER(${fields.category}) = :taxonomyExact
        OR LOWER(${fields.subcategory}) = :taxonomyExact
        OR LOWER(${fields.brand}) = :taxonomyExact
        OR LOWER(${fields.keyword}) = :taxonomyExact THEN 1000
      WHEN LOWER(${fields.category}) LIKE :taxonomyPrefix
        OR LOWER(${fields.subcategory}) LIKE :taxonomyPrefix
        OR LOWER(${fields.brand}) LIKE :taxonomyPrefix
        OR LOWER(${fields.keyword}) LIKE :taxonomyPrefix THEN 800
      WHEN LOWER(${fields.category}) LIKE :taxonomyLike
        OR LOWER(${fields.subcategory}) LIKE :taxonomyLike
        OR LOWER(${fields.brand}) LIKE :taxonomyLike
        OR LOWER(${fields.keyword}) LIKE :taxonomyLike THEN 600
      ELSE 300
    END`,
    parameters,
  };
}
