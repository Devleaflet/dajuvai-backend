import { normalizeSearchQuery } from "./normalize-search-query";

export interface AdminProductSearch {
  where: string;
  /** Lower is better; aggregate with MIN across a product's variant rows. */
  rank: string;
  parameters: Record<string, string>;
}

/** Postgres LIKE wildcards in what was typed are meant literally. */
const escapeLike = (value: string): string => value.replace(/[\\%_]/g, (char) => `\\${char}`);

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * How close a misspelt word must come to a word in the catalogue's search text
 * (pg_trgm `word_similarity`). 0.4 lets "jaket", "womn" and "sneakrs" through;
 * swapped letters ("shrit") share too few trigrams for any threshold that
 * stays this selective.
 */
const TYPO_SIMILARITY = 0.4;
const TYPO_MIN_LENGTH = 4;

/**
 * Columns a single typed word may land in. `search_text` is the indexer's
 * flattened copy of name, brand, category, subcategory, keywords and every
 * variant's SKU and attributes, so a colour or size is findable too.
 */
const WORD_COLUMNS = [
  `"product"."name"`,
  `"product"."search_text"`,
  `"product"."brand"`,
  `"product"."keywords"`,
  `"category"."name"`,
  `"subcategory"."name"`,
  `"vendor"."businessName"`,
  `"variants"."sku"`,
];

/**
 * The admin product picker's search.
 *
 * Each word has to match somewhere, but not all in the same place: "nike
 * shoes" is a brand plus a subcategory, "red kurta" an attribute plus a name.
 * Matching the whole phrase against one column at a time — what this replaced —
 * found neither. A product id, or the full phrase inside the description, still
 * matches on its own, and a word with a typo in it is the last resort.
 *
 * Ranking prefers a word that *starts* a word ("men" in "Mens shirt", or in
 * "Men's Fashion") over one buried inside another ("men" in "Women's").
 */
export function buildAdminProductSearch(input: string): AdminProductSearch | undefined {
  const phrase = input.trim();
  const words = normalizeSearchQuery(phrase).split(" ").filter(Boolean);
  if (!phrase || words.length === 0) return undefined;

  const parameters: Record<string, string> = {
    adminSearchPhrase: `%${escapeLike(phrase)}%`,
    adminSearchPrefix: `${escapeLike(phrase)}%`,
    adminSearchNormalized: words.join(" "),
  };

  const literalClauses: string[] = [];
  const lenientClauses: string[] = [];
  words.forEach((word, index) => {
    const key = `adminSearchWord${index}`;
    parameters[key] = `%${escapeLike(word)}%`;
    parameters[`${key}Start`] = `\\m${escapeRegex(word)}`;
    const literal = `(${WORD_COLUMNS.map((column) => `${column} ILIKE :${key}`).join(" OR ")})`;
    literalClauses.push(literal);

    if (word.length < TYPO_MIN_LENGTH) {
      lenientClauses.push(literal);
      return;
    }
    parameters[`${key}Plain`] = word;
    // pg_trgm, already installed for the storefront search.
    lenientClauses.push(
      `(${literal} OR word_similarity(:${key}Plain, "product"."search_text") >= ${TYPO_SIMILARITY})`,
    );
  });

  const allWordsStartInName = words
    .map((_, index) => `"product"."name" ~* :adminSearchWord${index}Start`)
    .join(" AND ");
  // The same, allowing each word to start a word of the category, brand or a
  // variant attribute instead: "shirt men" is a shirt filed under men's.
  const allWordsStartInText = words
    .map((_, index) => `"product"."search_text" ~* :adminSearchWord${index}Start`)
    .join(" AND ");
  const allWordsInName = words
    .map((_, index) => `"product"."name" ILIKE :adminSearchWord${index}`)
    .join(" AND ");
  const allWords = literalClauses.join(" AND ");
  const taxonomyMatch = `("category"."name" ILIKE :adminSearchPhrase OR "subcategory"."name" ILIKE :adminSearchPhrase)`;

  return {
    parameters,
    where: `(
      CAST("product"."id" AS TEXT) = :adminSearchNormalized
      OR (${lenientClauses.join(" AND ")})
      OR "product"."description" ILIKE :adminSearchPhrase
    )`,
    rank: `CASE
      WHEN CAST("product"."id" AS TEXT) = :adminSearchNormalized THEN 0
      WHEN "product"."name" ILIKE :adminSearchPrefix THEN 1
      WHEN ${allWordsStartInName} THEN 2
      WHEN ${allWordsStartInText} THEN 3
      WHEN "product"."name" ILIKE :adminSearchPhrase THEN 4
      WHEN ${allWordsInName} THEN 5
      WHEN "variants"."sku" ILIKE :adminSearchPhrase THEN 6
      WHEN ${taxonomyMatch} THEN 7
      WHEN (${allWords}) THEN 8
      WHEN "product"."description" ILIKE :adminSearchPhrase THEN 9
      ELSE 10
    END`,
  };
}
