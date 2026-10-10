import { describe, expect, it } from "vitest";

import { buildAdminProductSearch } from "./admin-product-search";

describe("buildAdminProductSearch", () => {
  it("returns nothing for a blank query", () => {
    expect(buildAdminProductSearch("   ")).toBeUndefined();
    expect(buildAdminProductSearch("!!")).toBeUndefined();
  });

  it("requires every word to match, each in any searched column", () => {
    const search = buildAdminProductSearch("Nike  shoes")!;
    expect(search.parameters.adminSearchWord0).toBe("%nike%");
    expect(search.parameters.adminSearchWord1).toBe("%shoes%");
    expect(search.where).toMatch(/"category"\."name" ILIKE :adminSearchWord0/);
    expect(search.where).toMatch(/"subcategory"\."name" ILIKE :adminSearchWord1/);
    expect(search.where).toMatch(/:adminSearchWord0[\s\S]*\) AND \([\s\S]*:adminSearchWord1/);
  });

  it("treats LIKE wildcards and regex characters as literal text", () => {
    const search = buildAdminProductSearch("50%_off")!;
    expect(search.parameters.adminSearchPhrase).toBe(String.raw`%50\%\_off%`);

    const regex = buildAdminProductSearch("c++")!;
    expect(regex.parameters.adminSearchWord0Start).toBe(String.raw`\mc\+\+`);
  });

  it("only allows typo matching for words long enough to be told apart", () => {
    const search = buildAdminProductSearch("red jaket")!;
    expect(search.parameters.adminSearchWord0Plain).toBeUndefined();
    expect(search.parameters.adminSearchWord1Plain).toBe("jaket");
    expect(search.where).toContain("word_similarity(:adminSearchWord1Plain");
    // A typo match never outranks a literal one.
    expect(search.rank).not.toContain("word_similarity");
  });

  it("matches a product id exactly and ranks it first", () => {
    const search = buildAdminProductSearch(" 412 ")!;
    expect(search.parameters.adminSearchNormalized).toBe("412");
    expect(search.rank).toMatch(/CAST\("product"\."id" AS TEXT\) = :adminSearchNormalized THEN 0/);
  });
});
