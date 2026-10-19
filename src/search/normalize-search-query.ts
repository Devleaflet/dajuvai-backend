// Small concept groups are safer than a large one-way dictionary: every term
// resolves both ways, generic words stay out, and future aliases belong in DB.
const SEARCH_CONCEPTS = [
  ["cosmetics", "cosmetic", "makeup", "make up", "beauty", "beauty products"],
  ["men", "man", "mens", "gents", "gent", "male", "boys", "boy"],
  ["women", "woman", "womens", "ladies", "lady", "female", "girls", "girl"],
  ["mobile", "phone", "smartphone", "cellphone", "cell phone", "mobile phone"],
  ["laptop", "notebook", "computer", "pc"],
  ["electronics", "gadgets", "technology", "tech"],
  ["fashion", "clothing", "apparel", "garments"],
  ["shoes", "shoe", "footwear", "sneakers", "sneaker", "sports shoes"],
  ["t shirt", "tshirt", "t shirts", "tee", "tee shirt"],
  ["earphone", "earphones", "headphone", "headphones", "headset", "earbuds", "ear buds"],
  ["jewelry", "jewellery"],
  ["kids", "children", "childrens"],
  ["groceries", "grocery", "food"],
  ["kitchen", "cookware", "cooking"],
  ["home", "household", "interior"],
  ["facewash", "face wash", "cleanser"],
  ["hair care", "haircare", "shampoo", "conditioner"],
  ["skin care", "skincare", "face care"],
  ["chasma", "glasses", "sunglasses"],
  ["fridge", "refrigerator"],
  ["home appliances", "appliances"],
] as const;

const SEARCH_SYNONYMS: Record<string, string[]> = Object.fromEntries(
  SEARCH_CONCEPTS.flatMap((concept) =>
    concept.map((term) => [term, concept.filter((candidate) => candidate !== term)]),
  ),
);

const PHRASE_SYNONYMS = Object.fromEntries(
  Object.entries(SEARCH_SYNONYMS).filter(([term]) => term.includes(" ")),
);

export function normalizeSearchQuery(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/[^\p{L}\p{N}+\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const compact = (value: string): string => value.replace(/\s+/g, "");

const levenshtein = (left: string, right: string): number => {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[right.length];
};

const similarity = (left: string, right: string): number => {
  const length = Math.max(left.length, right.length);
  return length ? 1 - levenshtein(left, right) / length : 1;
};

const synonymKeys = (): string[] => Object.keys(SEARCH_SYNONYMS);

const pluralize = (value: string): string => {
  if (/[sxz]$|(?:ch|sh)$/u.test(value)) return `${value}es`;
  if (/[^aeiou]y$/u.test(value)) return `${value.slice(0, -1)}ies`;
  return `${value}s`;
};

const inflectionVariants = (token: string): string[] => {
  const values = new Set<string>([token]);
  let singular: string | undefined;
  if (/ies$/u.test(token) && token.length > 4) {
    singular = `${token.slice(0, -3)}y`;
  } else if (/(ches|shes|xes|zes|ses)$/u.test(token) && token.length > 4) {
    singular = token.slice(0, -2);
  } else if (/s$/u.test(token) && !/(ss|us)$/u.test(token) && token.length > 3) {
    singular = token.slice(0, -1);
  }
  if (singular) values.add(singular);

  for (const value of [...values]) {
    if (!/s$/u.test(value)) values.add(pluralize(value));
  }
  return [...values];
};

/**
 * A token's inflections and the concepts it names *exactly*.
 *
 * No guessing here. Everything this returns is something the shopper literally
 * typed, a plural of it, or a concept whose term it is — so it is safe to treat
 * as a literal match.
 */
const relatedTerms = (token: string): string[] => {
  const values = new Set<string>();
  for (const variant of inflectionVariants(token)) {
    values.add(variant);
    for (const synonym of SEARCH_SYNONYMS[variant] ?? []) values.add(synonym);
  }
  return [...values];
};

/*
 * How close a token has to be to a concept term before it is treated as a
 * misspelling of it.
 *
 * `similarity` is `1 - editDistance / longerLength`, so the bar is really a
 * statement about how long a word has to be to survive one edit:
 *
 * - at 4 characters one edit scores 0.75 and is rejected;
 * - at 5 it scores 0.80 and is accepted;
 * - at 6 it scores 0.83.
 *
 * 0.72 with a 4-character floor is what produced the "make up" bug: `make` is
 * one substitution from `male`, scored 0.75, and pulled in the entire men's
 * concept — so a cosmetics search returned men's fashion. Four-letter words are
 * one edit from far too much to guess at.
 */
const FUZZY_SYNONYM_THRESHOLD = 0.8;
const FUZZY_SYNONYM_MIN_LENGTH = 5;

/**
 * The concepts a token might be a *misspelling* of.
 *
 * Kept apart from `relatedTerms` because these are guesses, and a guess must
 * never widen a search that is already finding real matches. `shops` is one
 * edit from `shoes`; expanding it inline meant someone searching for shops got
 * footwear mixed into otherwise valid results. Callers put these behind the
 * same gate as trigram matching — used only when literal matching found
 * nothing at all.
 */
const fuzzyRelatedTerms = (token: string): string[] => {
  const values = new Set<string>();
  for (const variant of inflectionVariants(token)) {
    if (variant.length < FUZZY_SYNONYM_MIN_LENGTH) continue;
    // An exact concept term is not a typo of itself, and `relatedTerms` has
    // already expanded it properly.
    if (SEARCH_SYNONYMS[variant]) continue;

    const fuzzyKey = synonymKeys().find(
      (key) => similarity(variant, key) >= FUZZY_SYNONYM_THRESHOLD,
    );
    if (fuzzyKey) {
      values.add(fuzzyKey);
      for (const synonym of SEARCH_SYNONYMS[fuzzyKey] ?? []) values.add(synonym);
    }
  }
  return [...values];
};

export function buildSearchCandidates(input: string): string[] {
  const query = normalizeSearchQuery(input);
  if (!query) return [];

  const tokens = query.split(" ").filter(Boolean);
  const values = [query, compact(query), ...tokens, ...(PHRASE_SYNONYMS[query] ?? [])];
  for (const token of tokens) {
    values.push(...relatedTerms(token));
  }

  return [...new Set(values.map(normalizeSearchQuery).filter(Boolean))];
}

/**
 * The typo-recovery half of the expansion, with anything already covered by
 * `buildSearchCandidates` removed so a caller can score the two tiers apart.
 */
export function buildFuzzySearchCandidates(input: string): string[] {
  const query = normalizeSearchQuery(input);
  if (!query) return [];

  const strict = new Set(buildSearchCandidates(query));
  const values: string[] = [];
  for (const token of query.split(" ").filter(Boolean)) {
    values.push(...fuzzyRelatedTerms(token));
  }

  return [
    ...new Set(
      values.map(normalizeSearchQuery).filter((value) => value && !strict.has(value)),
    ),
  ];
}

export function resolveTaxonomyCandidates(
  input: string,
  candidates: Array<{ id: number; name: string }>,
): number[] {
  const query = normalizeSearchQuery(input);
  if (!query) return [];
  const queryTokens = query.split(" ").filter(Boolean);

  const ranked = candidates
    .map((candidate) => {
      const name = normalizeSearchQuery(candidate.name);
      const nameTokens = name.split(" ").filter(Boolean);
      const compactName = compact(name);
      const compactQuery = compact(query);
      const allTokensMatch = queryTokens.every((token) =>
        nameTokens.some((nameToken) => nameToken.includes(token)),
      );
      const tokenPrefixMatch = queryTokens.some((token) =>
        nameTokens.some((nameToken) => nameToken.startsWith(token)),
      );
      const fuzzyScore = similarity(compactQuery, compactName);
      const score =
        name === query
          ? 1000
          : name.startsWith(query) || compactName.startsWith(compactQuery)
            ? 900
            : allTokensMatch
              ? 800
              : tokenPrefixMatch
                ? 700
                : fuzzyScore >= (query.length < 5 ? 0.72 : 0.55)
                  ? 500 + fuzzyScore * 100
                  : 0;
      return { id: candidate.id, score };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.id - right.id);

  return ranked.slice(0, 10).map((candidate) => candidate.id);
}

export function expandSearchQuery(normalizedQuery: string): string[] {
  const query = normalizeSearchQuery(normalizedQuery);
  const expanded: string[] = [];
  const seen = new Set<string>();

  for (const value of PHRASE_SYNONYMS[query] ?? []) {
    const normalized = normalizeSearchQuery(value);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      expanded.push(normalized);
    }
  }

  for (const token of query.split(" ")) {
    if (!token) continue;
    for (const value of relatedTerms(token)) {
      if (!seen.has(value)) {
        seen.add(value);
        expanded.push(value);
      }
    }
  }

  return expanded;
}
