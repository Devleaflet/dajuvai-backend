const SEARCH_SYNONYMS: Record<string, string[]> = {
  mobile: ["phone", "smartphone"],
  phone: ["mobile", "smartphone"],
  sneakers: ["sports shoes"],
  footwear: ["shoes"],
  facewash: ["face wash", "cleanser"],
  chasma: ["glasses", "sunglasses"],
  fridge: ["refrigerator"],
  ladies: ["women"],
  gents: ["men"],
};

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

export function expandSearchQuery(normalizedQuery: string): string[] {
  const expanded: string[] = [];
  const seen = new Set<string>();

  for (const token of normalizeSearchQuery(normalizedQuery).split(" ")) {
    if (!token) continue;
    for (const value of [token, ...(SEARCH_SYNONYMS[token] ?? [])]) {
      if (!seen.has(value)) {
        seen.add(value);
        expanded.push(value);
      }
    }
  }

  return expanded;
}
