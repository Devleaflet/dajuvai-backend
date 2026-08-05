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

const relatedTerms = (token: string): string[] => {
  const values = new Set<string>();
  for (const variant of inflectionVariants(token)) {
    values.add(variant);
    for (const synonym of SEARCH_SYNONYMS[variant] ?? []) values.add(synonym);
    if (variant.length >= 4) {
      const fuzzyKey = synonymKeys().find(
        (key) => similarity(variant, key) >= 0.72,
      );
      if (fuzzyKey) {
        values.add(fuzzyKey);
        for (const synonym of SEARCH_SYNONYMS[fuzzyKey] ?? []) values.add(synonym);
      }
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
