import { describe, expect, it } from "vitest";

import { buildCatalogSearchCondition } from "./catalog-search";
import {
  buildFuzzySearchCandidates,
  buildSearchCandidates,
} from "./normalize-search-query";

describe("buildSearchCandidates", () => {
  it("does not turn a cosmetics search into a menswear search", () => {
    /*
     * The reported bug: searching "make up" returned Men's Fashion.
     *
     * "make" is one substitution from "male", which at four characters scored
     * 0.75 against a 0.72 threshold, so the whole men's concept was expanded
     * into the literal match tier.
     */
    const candidates = buildSearchCandidates("make up");

    for (const term of ["male", "men", "mens", "man", "gents", "boys", "boy"]) {
      expect(candidates).not.toContain(term);
    }
  });

  it("still resolves the concept the shopper actually meant", () => {
    expect(buildSearchCandidates("make up")).toEqual(
      expect.arrayContaining(["makeup", "cosmetics", "beauty"]),
    );
  });

  it("keeps a real word out of a neighbouring concept", () => {
    // "shops" is one edit from "shoes"; it used to return footwear.
    expect(buildSearchCandidates("shops")).not.toContain("footwear");
  });

  it("still expands an exact concept term, in either number", () => {
    expect(buildSearchCandidates("shoes")).toEqual(
      expect.arrayContaining(["footwear", "sneakers"]),
    );
    expect(buildSearchCandidates("shoe")).toEqual(
      expect.arrayContaining(["footwear"]),
    );
  });

  it("still expands a phrase", () => {
    expect(buildSearchCandidates("t shirt")).toEqual(
      expect.arrayContaining(["tshirt", "tee"]),
    );
  });
});

describe("buildFuzzySearchCandidates", () => {
  it("recovers a genuine misspelling", () => {
    // Long enough that one edit is a typo rather than a different word.
    expect(buildFuzzySearchCandidates("makup")).toEqual(
      expect.arrayContaining(["makeup", "cosmetics"]),
    );
    expect(buildFuzzySearchCandidates("laptap")).toEqual(
      expect.arrayContaining(["laptop"]),
    );
  });

  it("refuses to guess at a four-letter word", () => {
    expect(buildFuzzySearchCandidates("make")).toEqual([]);
  });

  it("never repeats what literal matching already covers", () => {
    const strict = buildSearchCandidates("shoes");
    for (const term of buildFuzzySearchCandidates("shoes")) {
      expect(strict).not.toContain(term);
    }
  });

  it("says nothing for an empty query", () => {
    expect(buildFuzzySearchCandidates("   ")).toEqual([]);
  });
});

describe("buildCatalogSearchCondition", () => {
  const parametersFor = (query: string) =>
    buildCatalogSearchCondition(query)?.parameters ?? {};

  const valuesWithPrefix = (query: string, prefix: string) =>
    Object.entries(parametersFor(query))
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => String(value).trim());

  it("keeps a typo guess out of the literal tier", () => {
    const condition = buildCatalogSearchCondition("shops");

    // The literal tier is what decides whether typo recovery runs at all, so a
    // guess appearing in it would suppress the recovery gate entirely.
    expect(condition?.lexicalWhere).not.toContain("searchFuzzyTerm");
    expect(condition?.where).toContain("searchFuzzyTerm");
  });

  it("does not offer menswear terms at any tier for a cosmetics query", () => {
    const literal = valuesWithPrefix("make up", "searchSynonym");
    const fuzzy = valuesWithPrefix("make up", "searchFuzzyTerm");

    expect([...literal, ...fuzzy]).not.toContain("men");
    expect([...literal, ...fuzzy]).not.toContain("male");
  });

  it("scores a typo guess below every literal match", () => {
    const condition = buildCatalogSearchCondition("laptap");
    const score = condition?.score ?? "";

    // 50 is the floor above "no match"; the literal synonym tier is 100 and
    // every name match is several hundred.
    expect(score).toContain("THEN 50");
    expect(score.indexOf("THEN 50")).toBeGreaterThan(score.indexOf("THEN 100"));
  });

  it("is undefined for a query with nothing searchable in it", () => {
    expect(buildCatalogSearchCondition("  !!  ")).toBeUndefined();
  });
});

describe("exact SKU matching", () => {
  it("compacts the query so every way of typing a SKU is the same query", () => {
    // `normalizeSearchQuery` turns the punctuation into spaces, so all three
    // of these have to arrive at one value to compare against the column.
    for (const input of ["QA-RED-001", "qa red 001", "QA_RED_001", "qared001"]) {
      expect(buildCatalogSearchCondition(input)?.parameters.searchCompact).toBe(
        "qared001",
      );
    }
  });

  it("matches the variant SKU with its own punctuation stripped", () => {
    const condition = buildCatalogSearchCondition("QA-RED-001");

    expect(condition?.skuMatch).toContain('"variants"."sku"');
    expect(condition?.skuMatch).toContain(":searchCompact");
    expect(condition?.skuMatch).toContain("[^[:alnum:]]+");
  });

  it("counts as a literal match, so a part number never falls through to typos", () => {
    const condition = buildCatalogSearchCondition("QA-RED-001");

    expect(condition?.lexicalWhere).toContain(condition?.skuMatch ?? "");
  });

  it("refuses to treat a two-character query as a SKU", () => {
    // "ab" would equal a two-character SKU and outrank real text relevance.
    expect(buildCatalogSearchCondition("ab")?.skuMatch).toBe("FALSE");
    expect(buildCatalogSearchCondition("abc")?.skuMatch).not.toBe("FALSE");
  });

  it("is always valid SQL, even when it cannot match", () => {
    // Callers interpolate this into a CASE without a null check.
    expect(buildCatalogSearchCondition("ab")?.skuMatch).toBe("FALSE");
  });
});
