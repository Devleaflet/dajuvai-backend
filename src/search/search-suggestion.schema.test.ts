import assert from "node:assert/strict";
import { searchSuggestionSchema } from "./search-suggestion.schema";

assert.equal(searchSuggestionSchema.safeParse({ q: "n" }).success, false);
assert.equal(searchSuggestionSchema.safeParse({ q: "x".repeat(81) }).success, false);
assert.equal(searchSuggestionSchema.safeParse({ q: "--" }).success, false);

const parsed = searchSuggestionSchema.parse({
  q: "  Nike Black ",
  productLimit: "8",
  categoryLimit: "3",
  brandLimit: "2",
});

assert.equal(parsed.q, "Nike Black");
assert.equal(parsed.productLimit, 8);
assert.equal(parsed.categoryLimit, 3);
assert.equal(parsed.brandLimit, 2);
