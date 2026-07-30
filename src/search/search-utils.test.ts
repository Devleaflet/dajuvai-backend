import assert from "node:assert/strict";
import {
  expandSearchQuery,
  normalizeSearchQuery,
} from "./normalize-search-query";
import { buildProductSearchText } from "./build-product-search-text";

assert.equal(
  normalizeSearchQuery("CeraVe   Face-Wash"),
  "cerave face wash",
);
assert.equal(normalizeSearchQuery("S23+ USB-C"), "s23+ usb c");
assert.equal(normalizeSearchQuery("Cérave"), "cerave");
assert.equal(normalizeSearchQuery("  "), "");
assert.deepEqual(expandSearchQuery("mobile cover"), [
  "mobile",
  "phone",
  "smartphone",
  "cover",
]);

assert.equal(
  buildProductSearchText({
    name: "CeraVe Foaming Cleanser",
    brandName: "CeraVe",
    categoryName: "Skincare",
    subcategoryName: "Face Wash",
    keywords: "oily skin",
    variants: [{ sku: "CRV-001", attributes: { color: "Black", size: "42" } }],
  }),
  "cerave foaming cleanser skincare face wash oily skin crv 001 black 42",
);
