import { DataSource, Repository } from "typeorm";
import { Product } from "../entities/product.entity";
import { buildProductSearchText } from "../search/build-product-search-text";
import { normalizeSearchQuery } from "../search/normalize-search-query";

type SearchIndexProduct = Pick<Product, "name" | "brand" | "keywords"> & {
  subcategory?: {
    name?: string;
    category?: { name?: string };
  };
  variants?: Array<{
    sku?: string;
    attributes?: Record<string, string | number | boolean | null | undefined>;
  }>;
};

export function toProductSearchFields(product: SearchIndexProduct): {
  normalizedName: string;
  searchText: string;
} {
  return {
    normalizedName: normalizeSearchQuery(product.name),
    searchText: buildProductSearchText({
      name: product.name,
      brandName: product.brand,
      categoryName: product.subcategory?.category?.name,
      subcategoryName: product.subcategory?.name,
      keywords: product.keywords,
      variants: product.variants,
    }),
  };
}

export class ProductSearchIndexer {
  private readonly productRepository: Repository<Product>;

  constructor(private readonly dataSource: DataSource) {
    this.productRepository = dataSource.getRepository(Product);
  }

  async refreshProduct(productId: number): Promise<void> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ["subcategory", "subcategory.category", "variants"],
    });

    if (!product) return;

    await this.productRepository.update(product.id, toProductSearchFields(product));
  }

  async refreshProductsAfterId(afterId: number, limit: number): Promise<number[]> {
    const products = await this.productRepository
      .createQueryBuilder("product")
      .select("product.id", "id")
      .where("product.id > :afterId", { afterId })
      .orderBy("product.id", "ASC")
      .limit(limit)
      .getRawMany<{ id: number }>();

    for (const product of products) {
      await this.refreshProduct(Number(product.id));
    }

    return products.map((product) => Number(product.id));
  }
}
