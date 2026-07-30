import { expandSearchQuery, normalizeSearchQuery } from "./normalize-search-query";

export interface CatalogSearchCondition {
  query: string;
  where: string;
  score: string;
  parameters: Record<string, string | number>;
}

const allTokenMatches = (column: string, parameterPrefix: string, count: number): string =>
  Array.from(
    { length: count },
    (_, index) => `${column} LIKE :${parameterPrefix}${index}`,
  ).join(" AND ");

export function buildCatalogSearchCondition(input: string): CatalogSearchCondition | undefined {
  const query = normalizeSearchQuery(input);
  if (!query) return undefined;

  const tokens = query.split(" ");
  const expandedTokens = expandSearchQuery(query).filter((token) => !tokens.includes(token));
  const parameters: Record<string, string | number> = {
    searchExact: query,
    searchPrefix: `${query}%`,
    searchLike: `%${query}%`,
    similarityThreshold: 0.25,
  };

  tokens.forEach((token, index) => {
    parameters[`searchToken${index}`] = `%${token}%`;
  });
  expandedTokens.forEach((token, index) => {
    parameters[`searchSynonym${index}`] = `%${token}%`;
  });

  const normalizedName = `"product"."normalized_name"`;
  const searchText = `"product"."search_text"`;
  const nameTokenMatch = allTokenMatches(normalizedName, "searchToken", tokens.length);
  const textTokenMatch = allTokenMatches(searchText, "searchToken", tokens.length);
  const synonymMatch = expandedTokens.length
    ? expandedTokens
        .map((_, index) => `${searchText} LIKE :searchSynonym${index}`)
        .join(" OR ")
    : "FALSE";
  const similarityMatch = `similarity(${normalizedName}, :searchExact) >= :similarityThreshold`;

  return {
    query,
    parameters,
    where: `(
      ${normalizedName} LIKE :searchLike
      OR ${searchText} LIKE :searchLike
      OR (${textTokenMatch})
      OR ${similarityMatch}
      OR (${synonymMatch})
    )`,
    score: `CASE
      WHEN ${normalizedName} = :searchExact THEN 1000
      WHEN ${normalizedName} LIKE :searchPrefix THEN 800
      WHEN (${nameTokenMatch}) THEN 650
      WHEN ${normalizedName} LIKE :searchLike THEN 550
      WHEN ${searchText} LIKE :searchLike THEN 400
      WHEN (${textTokenMatch}) THEN 300
      WHEN ${similarityMatch} THEN 200
      WHEN (${synonymMatch}) THEN 100
      ELSE 0
    END`,
  };
}
