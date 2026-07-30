import assert from "node:assert/strict";
import { buildCatalogSearchCondition } from "./catalog-search";

const condition = buildCatalogSearchCondition("Nike Black 42");

assert.equal(condition.query, "nike black 42");
assert.match(condition.where, /normalized_name/);
assert.match(condition.where, /search_text/);
assert.match(condition.score, /THEN 1000/);
assert.match(condition.score, /THEN 800/);
assert.equal(condition.parameters.searchExact, "nike black 42");
assert.equal(condition.parameters.searchToken0, "%nike%");
assert.equal(condition.parameters.searchToken2, "%42%");
