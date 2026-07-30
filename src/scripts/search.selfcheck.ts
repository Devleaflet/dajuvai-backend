import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const productService = fs.readFileSync(
  path.resolve(__dirname, "../service/product.service.ts"),
  "utf8",
);

assert(
  productService.includes("await this.productSearchIndexer.refreshProduct(savedProduct.id)"),
  "ProductService must refresh search fields after saved product mutations",
);

assert(
  productService.includes("new ProductSearchIndexer(this.dataSource)"),
  "ProductService must own one ProductSearchIndexer",
);

assert(
  productService.includes("buildCatalogSearchCondition(search)"),
  "ProductService must use shared catalog search ranking",
);

assert(
  productService.includes("await this.productSearchIndexer.refreshProduct(productId)"),
  "ProductService must refresh search fields after variant restore",
);
