import assert from "node:assert/strict";
import { toProductSearchFields } from "./product-search-indexer.service";

assert.deepEqual(
  toProductSearchFields({
    name: "Nike Air Max",
    brand: "Nike",
    subcategory: { name: "Running Shoes", category: { name: "Footwear" } },
    keywords: "sport shoes",
    variants: [{ sku: "NK-42", attributes: { color: "Black", size: "42" } }],
  }),
  {
    normalizedName: "nike air max",
    searchText: "nike air max footwear running shoes sport nk 42 black",
  },
);
