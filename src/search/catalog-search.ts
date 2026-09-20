import {
  buildFuzzySearchCandidates,
  buildSearchCandidates,
  normalizeSearchQuery,
} from "./normalize-search-query";

export interface CatalogSearchCondition {
  query: string;
  where: string;
  lexicalWhere: string;
  score: string;
  /**
   * Exact variant SKU, as its own expression.
   *
   * Separate from `score` because it is the only part of matching that depends
   * on the *variant* row rather than the product: `score` is aggregated with
   * `MIN` across a product's variants, which is only sound while every term in
   * it is constant per product. A caller aggregates this one with `MAX` and
   * orders on it first.
   *
   * `FALSE` when the query could not be a SKU, so the expression is always
   * valid SQL and no caller needs a null check.
   */
  skuMatch: string;
  parameters: Record<string, string | number>;
}

/**
 * How short a compacted query may be before SKU matching is pointless.
 *
 * Two characters would let "ab" equal a two-character SKU, and every such match
 * would outrank genuine text relevance.
 */
const MIN_SKU_LENGTH = 3;

/** A SKU with its punctuation removed, which is how SKUs are typed and printed. */
const compactSkuColumn = (column: string): string =>
  `lower(regexp_replace(COALESCE(${column}, ''), '[^[:alnum:]]+', '', 'g'))`;

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
  /*
   * Terms the query might be a misspelling of, kept out of `expandedTokens`.
   *
   * These belong with trigram matching, not beside it: both are guesses, and
   * the service only reaches for either when literal matching returned nothing.
   * Treating them as literal is what let "make up" — one edit from "male" —
   * answer with men's fashion while real cosmetics were available to return.
   */
  const fuzzyTokens = buildFuzzySearchCandidates(query).filter(
    (token) => !tokens.includes(token) && !expandedTokens.includes(token),
  );
  // Punctuation is stripped by `normalizeSearchQuery` into spaces, so "QA-RED-001"
  // arrives as "qa red 001"; closing the spaces back up is what makes it equal
  // to the stored SKU with its own punctuation removed.
  const compactQuery = query.replace(/\s+/g, "");
  const parameters: Record<string, string | number> = {
    searchCompact: compactQuery,
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
    // Match token prefixes at word boundaries: `tes` matches `test`, but not
    // the middle of `contest`.
    parameters[`searchTokenPrefix${index}`] = `% ${token}%`;
  });
  expandedTokens.forEach((token, index) => {
    parameters[`searchSynonym${index}`] = `% ${token} %`;
  });
  // Named so it cannot be picked up by the `searchSynonym` prefix scans in
  // `search.service.ts`, which build the taxonomy and name-relevance clauses
  // from the literal tier only.
  fuzzyTokens.forEach((token, index) => {
    parameters[`searchFuzzyTerm${index}`] = `% ${token} %`;
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
  const nameTokenPrefixMatch = Array.from(
    { length: tokens.length },
    (_, index) => boundaryMatch(normalizedName, `searchTokenPrefix${index}`),
  ).join(" AND ");
  const textTokenPrefixMatch = Array.from(
    { length: tokens.length },
    (_, index) => boundaryMatch(searchText, `searchTokenPrefix${index}`),
  ).join(" AND ");
  const synonymMatch = expandedTokens.length
    ? expandedTokens
        .map((_, index) => boundaryMatch(searchText, `searchSynonym${index}`))
        .join(" OR ")
    : "FALSE";
  const fuzzySynonymMatch = fuzzyTokens.length
    ? fuzzyTokens
        .map((_, index) => boundaryMatch(searchText, `searchFuzzyTerm${index}`))
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
  const normalizedNamePrefixMatch = tokens.length === 1
    ? boundaryMatch(normalizedName, "searchTokenPrefix0")
    : nameTokenPrefixMatch;
  const searchTextPrefixMatch = tokens.length === 1
    ? boundaryMatch(searchText, "searchTokenPrefix0")
    : textTokenPrefixMatch;

  /*
   * An exact SKU is the least ambiguous thing anyone can type, so it is a
   * literal match: it belongs in the lexical tier, where finding it suppresses
   * typo recovery entirely. Searching a part number should never return
   * "something spelled a bit like your part number".
   */
  const skuMatch =
    compactQuery.length >= MIN_SKU_LENGTH
      ? `${compactSkuColumn('"variants"."sku"')} = :searchCompact`
      : "FALSE";

  const lexicalWhere = `(
    ${skuMatch}
    OR ${normalizedNameMatch}
    OR ${searchTextMatch}
    OR ${normalizedNamePrefixMatch}
    OR ${searchTextPrefixMatch}
    OR (${nameTokenPrefixMatch})
    OR (${textTokenPrefixMatch})
    OR (${textTokenMatch})
    OR (${synonymMatch})
    OR ${fullTextMatch}
  )`;
  const fuzzyWhere = `(
    ${similarityMatch}
    OR ${wordSimilarityMatch}
    OR (${fuzzySynonymMatch})
  )`;

  return {
    query,
    parameters,
    skuMatch,
    lexicalWhere,
    where: `(${lexicalWhere} OR ${fuzzyWhere})`,
    score: `CASE
      WHEN ${normalizedName} = :searchExact THEN 1000
      WHEN ${normalizedName} LIKE :searchPrefix THEN 900
      WHEN (${nameTokenPrefixMatch}) THEN 800
      WHEN (${nameTokenMatch}) THEN 650
      WHEN ${fullTextMatch} THEN 600 + (${fullTextScore} * 100)
      WHEN ${normalizedNameMatch} THEN 550
      WHEN ${searchTextPrefixMatch} THEN 500
      WHEN ${searchTextMatch} THEN 400
      WHEN (${textTokenMatch}) THEN 300
      WHEN ${similarityMatch} THEN 200
      WHEN ${wordSimilarityMatch} THEN 180
      WHEN (${synonymMatch}) THEN 100
      WHEN (${fuzzySynonymMatch}) THEN 50
      ELSE 0
    END`,
  };
}
