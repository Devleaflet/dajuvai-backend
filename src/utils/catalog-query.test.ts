import assert from "node:assert/strict";
import { buildCatalogTaxonomyFilter, normalizeCatalogQuery } from "./catalog-query";

const normalized = normalizeCatalogQuery({
  categoryId: "3,8",
  subcategoryId: ["11", "12"],
  minPrice: "100",
  maxPrice: "900",
  minRating: "4",
  hasDeal: "true",
  dealId: "4,9",
  sort: "best_selling",
  page: "2",
  limit: "24",
});

assert.deepEqual(normalized, {
  categoryIds: [3, 8],
  subcategoryIds: [11, 12],
  minPrice: 100,
  maxPrice: 900,
  minRating: 4,
  hasDeal: true,
  dealIds: [4, 9],
  sort: "best_selling",
  page: 2,
  limit: 24,
});

assert.deepEqual(
  normalizeCatalogQuery({ categoryId: "3", sort: "low-to-high" }),
  {
    categoryIds: [3],
    subcategoryIds: [],
    minPrice: undefined,
    maxPrice: undefined,
    minRating: undefined,
    hasDeal: undefined,
    sort: "price_low_high",
    page: 1,
    limit: 40,
  },
);

assert.deepEqual(
  normalizeCatalogQuery({ search: " Nike--Black ", sort: "relevance", limit: "48" }),
  {
    categoryIds: [],
    subcategoryIds: [],
    minPrice: undefined,
    maxPrice: undefined,
    minRating: undefined,
    hasDeal: undefined,
    sort: "relevance",
    page: 1,
    limit: 48,
    search: "nike black",
  },
);

assert.throws(
  () => normalizeCatalogQuery({ search: "x".repeat(81) }),
  /80 characters/i,
);

assert.throws(
  () => normalizeCatalogQuery({ search: "--" }),
  /searchable characters/i,
);

assert.throws(
  () => normalizeCatalogQuery({ minPrice: "900", maxPrice: "100" }),
  /minimum price cannot exceed maximum price/i,
);

assert.deepEqual(buildCatalogTaxonomyFilter([1], [42]), {
  condition: "(subcategory.categoryId IN (:...categoryIds) OR product.subcategoryId IN (:...subcategoryIds))",
  parameters: { categoryIds: [1], subcategoryIds: [42] },
});

assert.deepEqual(buildCatalogTaxonomyFilter([1], []), {
  condition: "subcategory.categoryId IN (:...categoryIds)",
  parameters: { categoryIds: [1] },
});

assert.deepEqual(buildCatalogTaxonomyFilter([], [42]), {
  condition: "product.subcategoryId IN (:...subcategoryIds)",
  parameters: { subcategoryIds: [42] },
});
