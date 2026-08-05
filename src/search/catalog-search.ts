import { buildSearchCandidates, normalizeSearchQuery } from "./normalize-search-query";

export interface CatalogSearchCondition {
  query: string;
  where: string;
  lexicalWhere: string;
  score: string;
  parameters: Record<string, string | number>;
}

export function buildCatalogSearchCondition(
  input: string,
  approvedAliases: string[] = [],
): CatalogSearchCondition | undefined {
  const query = normalizeSearchQuery(input);
  if (!query) return undefined;

  const tokens = query.split(" ");
  const expandedTokens = [...new Set([
    ...buildSearchCandidates(query),
    ...approvedAliases.map(normalizeSearchQuery),
  ])].filter((token) => token && !tokens.includes(token));
  const parameters: Record<string, string | number> = {
    searchExact: query,
    searchPrefix: `${query}%`,
    searchLike: `%${query}%`,
    searchBoundary: `% ${query} %`,
    similarityThreshold: query.length < 4 ? 0.55 : 0.35,
    wordSimilarityThreshold: query.length < 4 ? 0.55 : 0.45,
    taxonomySimilarityThreshold: query.length < 4 ? 0.55 : 0.35,
  };

  tokens.forEach((token, index) => {
    parameters[`searchToken${index}`] = `% ${token} %`;
  });
  expandedTokens.forEach((token, index) => {
    parameters[`searchSynonym${index}`] = `% ${token} %`;
  });

  const normalizedName = `"product"."normalized_name"`;
  const searchText = `"product"."search_text"`;
  const searchVector = `"product"."search_vector"`;
  const boundaryMatch = (column: string, parameter: string): string =>
    `(' ' || COALESCE(${column}, '') || ' ') LIKE :${parameter}`;
  const nameTokenMatch = Array.from(
    { length: tokens.length },
    (_, index) => boundaryMatch(normalizedName, `searchToken${index}`),
  ).join(" AND ");
  const textTokenMatch = Array.from(
    { length: tokens.length },
    (_, index) => boundaryMatch(searchText, `searchToken${index}`),
  ).join(" AND ");
  const synonymMatch = expandedTokens.length
    ? expandedTokens
        .map((_, index) => boundaryMatch(searchText, `searchSynonym${index}`))
        .join(" OR ")
    : "FALSE";
  const fullTextMatch = `${searchVector} @@ websearch_to_tsquery('simple', :searchExact)`;
  const fullTextScore = `ts_rank_cd(${searchVector}, websearch_to_tsquery('simple', :searchExact), 32)`;
  const similarityMatch = `similarity(${normalizedName}, :searchExact) >= :similarityThreshold`;
  const wordSimilarityMatch = `strict_word_similarity(:searchExact, ${searchText}) >= :wordSimilarityThreshold`;
  const normalizedNameMatch = tokens.length === 1
    ? boundaryMatch(normalizedName, "searchBoundary")
    : `${normalizedName} LIKE :searchLike`;
  const searchTextMatch = tokens.length === 1
    ? boundaryMatch(searchText, "searchBoundary")
    : `${searchText} LIKE :searchLike`;

  const lexicalWhere = `(
    ${normalizedNameMatch}
    OR ${searchTextMatch}
    OR (${textTokenMatch})
    OR (${synonymMatch})
    OR ${fullTextMatch}
  )`;
  const fuzzyWhere = `(
    ${similarityMatch}
    OR ${wordSimilarityMatch}
  )`;

  return {
    query,
    parameters,
    lexicalWhere,
    where: `(${lexicalWhere} OR ${fuzzyWhere})`,
    score: `CASE
      WHEN ${normalizedName} = :searchExact THEN 1000
      WHEN ${normalizedName} LIKE :searchPrefix AND ${normalizedNameMatch} THEN 800
      WHEN (${nameTokenMatch}) THEN 650
      WHEN ${fullTextMatch} THEN 600 + (${fullTextScore} * 100)
      WHEN ${normalizedNameMatch} THEN 550
      WHEN ${searchTextMatch} THEN 400
      WHEN (${textTokenMatch}) THEN 300
      WHEN ${similarityMatch} THEN 200
      WHEN ${wordSimilarityMatch} THEN 180
      WHEN (${synonymMatch}) THEN 100
      ELSE 0
    END`,
  };
}
