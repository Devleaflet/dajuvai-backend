import { DataSource, EntityManager } from "typeorm";
import { Category } from "../entities/category.entity";
import { Product } from "../entities/product.entity";
import { Review } from "../entities/reviews.entity";
import { buildCatalogSearchCondition } from "../search/catalog-search";
import { normalizeSearchQuery } from "../search/normalize-search-query";
import type { SearchSuggestionInput } from "../search/search-suggestion.schema";

type ProductSuggestionRow = {
  id: string;
  name: string;
  thumbnail_url: string | null;
  effective_price: string;
  original_price: string;
  discount_percentage: string;
  average_rating: string;
  total_reviews: string;
  in_stock: string;
};

export class SearchService {
  constructor(private readonly dataSource: DataSource) {}

  async getSuggestions(input: SearchSuggestionInput) {
    const query = normalizeSearchQuery(input.q);
    const searchCondition = buildCatalogSearchCondition(query);
    if (!searchCondition) {
      return { query, products: [], categories: [], brands: [], totalProducts: 0 };
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL statement_timeout = '1500ms'");
      const [products, categories, brands, totalProducts] = await Promise.all([
        this.searchProducts(manager, searchCondition, input.productLimit),
        this.searchCategories(manager, query, input.categoryLimit),
        this.searchBrands(manager, query, input.brandLimit),
        this.countProducts(manager, searchCondition),
      ]);

      return { query, products, categories, brands, totalProducts };
    });
  }

  private async searchProducts(
    manager: EntityManager,
    searchCondition: NonNullable<ReturnType<typeof buildCatalogSearchCondition>>,
    limit: number,
  ) {
    const ratingQuery = manager
      .getRepository(Review)
      .createQueryBuilder("review")
      .select("review.productId", "product_id")
      .addSelect("AVG(review.rating)", "average_rating")
      .addSelect("COUNT(*)", "total_reviews")
      .groupBy("review.productId");

    const rows = await manager
      .getRepository(Product)
      .createQueryBuilder("product")
      .leftJoin("product.variants", "variants", "variants.deletedAt IS NULL")
      .leftJoin(`(${ratingQuery.getQuery()})`, "rating", "rating.product_id = product.id")
      .where("product.deletedAt IS NULL")
      .andWhere(searchCondition.where, searchCondition.parameters)
      .select("product.id", "id")
      .addSelect("product.name", "name")
      .addSelect('COALESCE("product"."productImages"[1], MIN("variants"."variantImages"[1]))', "thumbnail_url")
      .addSelect('COALESCE(NULLIF("product"."finalPrice", 0), MIN(NULLIF("variants"."finalPrice", 0)), NULLIF("product"."basePrice", 0), MIN(NULLIF("variants"."basePrice", 0)), 0)', "effective_price")
      .addSelect('COALESCE(NULLIF("product"."basePrice", 0), MIN(NULLIF("variants"."basePrice", 0)), 0)', "original_price")
      .addSelect('GREATEST(COALESCE("product"."discountPercent", 0), COALESCE(MAX("variants"."discountPercent"), 0))', "discount_percentage")
      .addSelect('COALESCE("rating"."average_rating", 0)', "average_rating")
      .addSelect('COALESCE("rating"."total_reviews", 0)', "total_reviews")
      .addSelect("MAX(CASE WHEN COALESCE(\"variants\".stock, \"product\".stock, 0) > 0 AND COALESCE(\"variants\".status::text, \"product\".status::text, '') != 'OUT_OF_STOCK' THEN 1 ELSE 0 END)", "in_stock")
      .addSelect(`MIN(${searchCondition.score})`, "search_score")
      .groupBy("product.id")
      .addGroupBy("rating.product_id")
      .addGroupBy("rating.average_rating")
      .addGroupBy("rating.total_reviews")
      .orderBy("search_score", "DESC")
      .addOrderBy("in_stock", "DESC")
      .addOrderBy("product.createdAt", "DESC")
      .addOrderBy("product.id", "DESC")
      .limit(limit)
      .getRawMany<ProductSuggestionRow>();

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      thumbnailUrl: row.thumbnail_url,
      effectivePrice: Number(row.effective_price),
      originalPrice: Number(row.original_price),
      discountPercentage: Number(row.discount_percentage),
      averageRating: Number(row.average_rating),
      totalReviews: Number(row.total_reviews),
      inStock: Number(row.in_stock) > 0,
      matchedVariant: null,
    }));
  }

  private async searchCategories(manager: EntityManager, query: string, limit: number) {
    if (limit === 0) return [];
    const rows = await manager
      .getRepository(Category)
      .createQueryBuilder("category")
      .where("LOWER(category.name) LIKE :query", { query: `%${query}%` })
      .select("category.id", "id")
      .addSelect("category.name", "name")
      .addSelect("category.image", "image")
      .orderBy("CASE WHEN LOWER(category.name) = :exact THEN 0 WHEN LOWER(category.name) LIKE :prefix THEN 1 ELSE 2 END", "ASC")
      .addOrderBy("category.name", "ASC")
      .setParameters({ exact: query, prefix: `${query}%` })
      .limit(limit)
      .getRawMany<{ id: string; name: string; image: string | null }>();

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      image: row.image,
    }));
  }

  private async searchBrands(manager: EntityManager, query: string, limit: number) {
    if (limit === 0) return [];
    const rows = await manager
      .getRepository(Product)
      .createQueryBuilder("product")
      .where("product.deletedAt IS NULL")
      .andWhere("product.brand IS NOT NULL")
      .andWhere("LOWER(product.brand) LIKE :query", { query: `%${query}%` })
      .select("MIN(product.id)", "id")
      .addSelect("product.brand", "name")
      .groupBy("product.brand")
      .orderBy("CASE WHEN LOWER(product.brand) = :exact THEN 0 WHEN LOWER(product.brand) LIKE :prefix THEN 1 ELSE 2 END", "ASC")
      .addOrderBy("product.brand", "ASC")
      .setParameters({ exact: query, prefix: `${query}%` })
      .limit(limit)
      .getRawMany<{ id: string; name: string }>();

    return rows.map((row) => ({ id: Number(row.id), name: row.name }));
  }

  private async countProducts(
    manager: EntityManager,
    searchCondition: NonNullable<ReturnType<typeof buildCatalogSearchCondition>>,
  ) {
    return manager
      .getRepository(Product)
      .createQueryBuilder("product")
      .where("product.deletedAt IS NULL")
      .andWhere(searchCondition.where, searchCondition.parameters)
      .getCount();
  }
}
