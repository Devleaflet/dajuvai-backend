import { DataSource, EntityManager, SelectQueryBuilder } from "typeorm";
import { Category } from "../entities/category.entity";
import { Subcategory } from "../entities/subcategory.entity";
import { Product } from "../entities/product.entity";
import { Review } from "../entities/reviews.entity";
import { OrderItem } from "../entities/orderItems.entity";
import { Banner } from "../entities/banner.entity";
import { SearchAliasService } from "./search-alias.service";
import { SearchLearningService } from "./search-learning.service";
import { buildCatalogSearchCondition } from "../search/catalog-search";
import {
  buildSearchCandidates,
  normalizeSearchQuery,
} from "../search/normalize-search-query";
import type { SearchSuggestionInput } from "../search/search-suggestion.schema";
import {
  mergeResolvedFilters,
  pickPrimaryResolvedFilters,
  type ProductSearchResult,
  type ResolvedSearchFilters,
  type SearchCatalogInput,
  type SearchCatalogResponse,
  type TaxonomySuggestion,
} from "../search/catalog-search.types";
import { getManualBannerProductIds } from "../utils/bannerProductSelection";

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

type CatalogRuntimeFilters = {
  input: SearchCatalogInput;
  manualBannerProductIds: number[] | null;
};

export class SearchService {
  private readonly searchAliasService: SearchAliasService;
  private readonly searchLearningService: SearchLearningService;

  constructor(private readonly dataSource: DataSource) {
    this.searchAliasService = new SearchAliasService(dataSource);
    this.searchLearningService = new SearchLearningService(dataSource);
  }

  async getCatalog(input: SearchCatalogInput): Promise<SearchCatalogResponse> {
    const normalizedQuery = normalizeSearchQuery(input.q);
    const query = input.q.trim();
    const emptyFilters: ResolvedSearchFilters = {
      categoryIds: [],
      subcategoryIds: [],
      brandNames: [],
      keyword: null,
    };

    if (!normalizedQuery) {
      return {
        query,
        normalizedQuery,
        resolvedFilters: emptyFilters,
        products: [],
        categories: [],
        subcategories: [],
        brands: [],
        totalProducts: 0,
        page: input.page,
        limit: input.limit,
        totalPages: 0,
      };
    }

    const approvedAliases = await this.searchAliasService.resolve(normalizedQuery);
    const response = await this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL statement_timeout = '1800ms'");
      const [categories, subcategories, brands] = await Promise.all([
        this.searchCategories(manager, normalizedQuery, 10, approvedAliases),
        this.searchSubcategories(manager, normalizedQuery, 10, approvedAliases),
        this.searchBrands(manager, normalizedQuery, 10, approvedAliases),
      ]);

      const explicitFilters: ResolvedSearchFilters = {
        categoryIds: input.categoryIds ? this.toNumberList(input.categoryIds) : [],
        subcategoryIds: input.subcategoryIds
          ? this.toNumberList(input.subcategoryIds)
          : [],
        brandNames: input.brand ? [input.brand] : [],
        keyword: null,
      };
      const runtimeFilters = await this.resolveRuntimeFilters(manager, input);
      const resolvedFilters = mergeResolvedFilters(explicitFilters, {
        ...pickPrimaryResolvedFilters(categories, subcategories, brands),
      });
      const searchCondition = buildCatalogSearchCondition(normalizedQuery, approvedAliases);
      const offset = (input.page - 1) * input.limit;
      const lexicalCondition = { ...searchCondition, where: searchCondition!.lexicalWhere };
      // Decide typo recovery from text alone. A selected facet that removes all
      // literal matches must return empty, never unlock unrelated fuzzy matches.
      const lexicalTotal = await this.countProducts(manager, lexicalCondition);
      // Fuzzy matching is a recovery path for typos, never a way to dilute a
      // valid literal/alias result set with weakly related products.
      const productCondition = lexicalTotal > 0 ? lexicalCondition : searchCondition;
      const totalProducts = await this.countProducts(
        manager,
        productCondition,
        explicitFilters,
        runtimeFilters,
      );
      const products = await this.searchProducts(
        manager,
        productCondition,
        input.limit,
        offset,
        explicitFilters,
        input.sort,
        runtimeFilters,
      );

      return {
        query,
        normalizedQuery,
        resolvedFilters,
        products,
        categories,
        subcategories,
        brands,
        totalProducts,
        page: input.page,
        limit: input.limit,
        totalPages: totalProducts ? Math.ceil(totalProducts / input.limit) : 0,
      };
    });
    void this.searchLearningService.recordSearch({
      normalizedQuery,
      resultCount: response.totalProducts,
    }).catch(() => undefined);
    return response;
  }

  private toNumberList(value: number | number[]): number[] {
    return [...new Set((Array.isArray(value) ? value : [value]).map(Number))].filter(
      (id) => Number.isInteger(id) && id > 0,
    );
  }

  private async resolveRuntimeFilters(
    manager: EntityManager,
    input: SearchCatalogInput,
  ): Promise<CatalogRuntimeFilters> {
    if (input.bannerId === undefined) return { input, manualBannerProductIds: null };
    const banner = await manager.getRepository(Banner).findOne({
      where: { id: input.bannerId },
      relations: ["selectedProducts"],
    });
    return {
      input,
      manualBannerProductIds: banner
        ? getManualBannerProductIds(banner)
        : [],
    };
  }

  async getSuggestions(input: SearchSuggestionInput) {
    const query = normalizeSearchQuery(input.q);
    const approvedAliases = await this.searchAliasService.resolve(query);
    const searchCondition = buildCatalogSearchCondition(query, approvedAliases);
    if (!searchCondition) {
      return { query, products: [], categories: [], brands: [], totalProducts: 0 };
    }

    return this.dataSource.transaction(async (manager) => {
      await manager.query("SET LOCAL statement_timeout = '1500ms'");
      const lexicalCondition = { ...searchCondition, where: searchCondition.lexicalWhere };
      const lexicalTotal = await this.countProducts(manager, lexicalCondition);
      const productCondition = lexicalTotal > 0 ? lexicalCondition : searchCondition;
      const [products, categories, brands, totalProducts] = await Promise.all([
        this.searchProducts(manager, productCondition, input.productLimit),
        this.searchCategories(manager, query, input.categoryLimit, approvedAliases),
        this.searchBrands(manager, query, input.brandLimit, approvedAliases),
        lexicalTotal > 0
          ? Promise.resolve(lexicalTotal)
          : this.countProducts(manager, productCondition),
      ]);

      return { query, products, categories, brands, totalProducts };
    });
  }

  private async searchProducts(
    manager: EntityManager,
    searchCondition: ReturnType<typeof buildCatalogSearchCondition>,
    limit: number,
    offset = 0,
    resolvedFilters?: ResolvedSearchFilters,
    sort: SearchCatalogInput["sort"] = "relevance",
    runtimeFilters?: CatalogRuntimeFilters,
  ): Promise<ProductSearchResult[]> {
    const ratingQuery = manager
      .getRepository(Review)
      .createQueryBuilder("review")
      .select("review.productId", "product_id")
      .addSelect("AVG(review.rating)", "average_rating")
      .addSelect("COUNT(*)", "total_reviews")
      .groupBy("review.productId");
    const salesQuery = manager
      .getRepository(OrderItem)
      .createQueryBuilder("order_item")
      .select("order_item.productId", "product_id")
      .addSelect("SUM(order_item.quantity)", "sold_quantity")
      .groupBy("order_item.productId");
    const taxonomyTextWhere = searchCondition
      ? this.buildTaxonomyTextWhere(searchCondition)
      : "FALSE";

    const query = manager
      .getRepository(Product)
      .createQueryBuilder("product")
      .leftJoin("product.variants", "variants", "variants.deletedAt IS NULL")
      .leftJoin("product.subcategory", "subcategory")
      .leftJoin("subcategory.category", "category")
      .leftJoin("product.deal", "deal")
      .leftJoin(`(${ratingQuery.getQuery()})`, "rating", "rating.product_id = product.id")
      .leftJoin(`(${salesQuery.getQuery()})`, "sales", "sales.product_id = product.id")
      .where("product.deletedAt IS NULL")
      .andWhere(
        this.buildProductSearchWhere(searchCondition, resolvedFilters, taxonomyTextWhere),
        this.buildProductSearchParameters(searchCondition, resolvedFilters),
      )
      .select("product.id", "id")
      .addSelect("product.name", "name")
      .addSelect('COALESCE("product"."productImages"[1], MIN("variants"."variantImages"[1]))', "thumbnail_url")
      .addSelect('COALESCE(NULLIF("product"."finalPrice", 0), MIN(NULLIF("variants"."finalPrice", 0)), NULLIF("product"."basePrice", 0), MIN(NULLIF("variants"."basePrice", 0)), 0)', "effective_price")
      .addSelect('COALESCE(NULLIF("product"."basePrice", 0), MIN(NULLIF("variants"."basePrice", 0)), 0)', "original_price")
      .addSelect('GREATEST(COALESCE("product"."discountPercent", 0), COALESCE(MAX("variants"."discountPercent"), 0))', "discount_percentage")
      .addSelect('COALESCE("rating"."average_rating", 0)', "average_rating")
      .addSelect('COALESCE("rating"."total_reviews", 0)', "total_reviews")
      .addSelect('COALESCE("sales"."sold_quantity", 0)', "sold_quantity")
      .addSelect("MAX(CASE WHEN COALESCE(\"variants\".stock, \"product\".stock, 0) > 0 AND COALESCE(\"variants\".status::text, \"product\".status::text, '') != 'OUT_OF_STOCK' THEN 1 ELSE 0 END)", "in_stock")
      .addSelect(
        this.buildProductNameRelevanceScore(searchCondition),
        "name_score",
      )
      .addSelect(`MIN(${searchCondition?.score ?? "0"})`, "search_score")
      .addSelect(
        `MAX(CASE WHEN ${taxonomyTextWhere} THEN 350 ELSE 0 END)`,
        "taxonomy_score",
      )
      .groupBy("product.id")
      .addGroupBy("rating.product_id")
      .addGroupBy("rating.average_rating")
      .addGroupBy("rating.total_reviews")
      .addGroupBy("sales.product_id")
      .addGroupBy("sales.sold_quantity")
      .offset(offset)
      .limit(limit);

    this.applyAdvancedFilters(query, runtimeFilters);

    if (sort === "newest") {
      query.orderBy("product.createdAt", "DESC");
    } else if (sort === "rating") {
      query.orderBy("average_rating", "DESC");
    } else if (sort === "price_low_high") {
      query.orderBy("effective_price", "ASC");
    } else if (sort === "price_high_low") {
      query.orderBy("effective_price", "DESC");
    } else if (sort === "discount_high_low") {
      query.orderBy("discount_percentage", "DESC");
    } else if (sort === "best_selling") {
      query.orderBy("sold_quantity", "DESC");
    } else {
      query.orderBy("name_score", "DESC");
      query.addOrderBy("search_score", "DESC");
    }
    query
      .addOrderBy("taxonomy_score", "DESC")
      .addOrderBy("in_stock", "DESC")
      .addOrderBy("product.createdAt", "DESC")
      .addOrderBy("product.id", "DESC");

    const rows = await query.getRawMany<ProductSuggestionRow>();

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

  private buildProductSearchWhere(
    searchCondition: ReturnType<typeof buildCatalogSearchCondition>,
    resolvedFilters?: ResolvedSearchFilters,
    taxonomyTextWhere = searchCondition
      ? this.buildTaxonomyTextWhere(searchCondition)
      : "FALSE",
  ): string {
    const searchWhere = searchCondition
      ? `(${searchCondition.where} OR ${taxonomyTextWhere})`
      : "FALSE";
    const filters: string[] = [];
    if (resolvedFilters?.categoryIds.length) {
      filters.push("category.id IN (:...resolvedCategoryIds)");
    }
    if (resolvedFilters?.subcategoryIds.length) {
      filters.push("subcategory.id IN (:...resolvedSubcategoryIds)");
    }
    if (resolvedFilters?.brandNames.length) {
      filters.push("product.brand IN (:...resolvedBrandNames)");
    }
    return filters.length ? `(${searchWhere} AND ${filters.join(" AND ")})` : searchWhere;
  }

  private applyAdvancedFilters(
    query: SelectQueryBuilder<Product>,
    runtimeFilters?: CatalogRuntimeFilters,
  ): void {
    if (!runtimeFilters) return;
    const { input, manualBannerProductIds } = runtimeFilters;
    if (input.bannerId !== undefined) {
      if (manualBannerProductIds !== null) {
        query.andWhere(
          manualBannerProductIds.length
            ? "product.id IN (:...manualBannerProductIds)"
            : "FALSE",
          manualBannerProductIds.length ? { manualBannerProductIds } : {},
        );
      } else {
        query.andWhere("product.bannerId = :bannerId", { bannerId: input.bannerId });
      }
    }
    const dealIds = input.dealIds
      ? this.toNumberList(input.dealIds)
      : [];
    if (dealIds.length) {
      query.andWhere("product.dealId IN (:...dealIds)", { dealIds });
      query.andWhere("deal.status = :selectedDealStatus", { selectedDealStatus: "ENABLED" });
    } else if (input.hasDeal === true) {
      query.andWhere("deal.status = :enabledDealStatus", { enabledDealStatus: "ENABLED" });
    }

    const effectivePrice = 'COALESCE(NULLIF("product"."finalPrice", 0), MIN(NULLIF("variants"."finalPrice", 0)), NULLIF("product"."basePrice", 0), MIN(NULLIF("variants"."basePrice", 0)), 0)';
    const ratingAverage = 'COALESCE("rating"."average_rating", 0)';
    if (input.minPrice !== undefined) query.having(`${effectivePrice} >= :minPrice`, { minPrice: input.minPrice });
    if (input.maxPrice !== undefined) query.andHaving(`${effectivePrice} <= :maxPrice`, { maxPrice: input.maxPrice });
    if (input.minRating !== undefined) query.andHaving(`${ratingAverage} >= :minRating`, { minRating: input.minRating });
  }

  private buildTaxonomyTextWhere(
    searchCondition: ReturnType<typeof buildCatalogSearchCondition>,
  ): string {
    const taxonomyField = (field: string): string =>
      `(' ' || regexp_replace(lower(COALESCE(${field}, '')), '[^[:alnum:]]+', ' ', 'g') || ' ')`;
    const directMatch = searchCondition.query.split(" ").length === 1
      ? `${taxonomyField("product.brand")} LIKE :searchBoundary`
      : `${taxonomyField("product.brand")} LIKE :searchLike`;
    const directMatches = [
        "product.brand",
        "product.keywords",
        "category.name",
      "subcategory.name",
    ].map((field) => {
      const expression = taxonomyField(field);
      return searchCondition.query.split(" ").length === 1
        ? `${expression} LIKE :searchBoundary`
        : `${expression} LIKE :searchLike`;
    });
    const synonymKeys = Object.keys(searchCondition?.parameters ?? {}).filter((key) =>
      key.startsWith("searchSynonym"),
    );
    const synonymMatches = synonymKeys.flatMap((key) =>
      [
        "product.brand",
        "product.keywords",
        "category.name",
        "subcategory.name",
      ].map((field) => `${taxonomyField(field)} LIKE :${key}`),
    );
    return `(
      ${directMatch}
      OR ${directMatches.slice(1).join(" OR ")}
      OR similarity(LOWER(product.brand), :searchExact) >= :taxonomySimilarityThreshold
      OR similarity(LOWER(category.name), :searchExact) >= :taxonomySimilarityThreshold
      OR similarity(LOWER(subcategory.name), :searchExact) >= :taxonomySimilarityThreshold
      ${synonymMatches.length ? `OR ${synonymMatches.join(" OR ")}` : ""}
    )`;
  }

  private buildProductNameRelevanceScore(
    searchCondition: ReturnType<typeof buildCatalogSearchCondition>,
  ): string {
    if (!searchCondition) return "0";
    const name = '"product"."normalized_name"';
    const nameBoundary = searchCondition.query.split(" ").length === 1
      ? `(' ' || COALESCE(${name}, '') || ' ') LIKE :searchBoundary`
      : `${name} LIKE :searchLike`;
    const namePrefix = searchCondition.query.split(" ").length === 1
      ? `(' ' || COALESCE(${name}, '') || ' ') LIKE :searchTokenPrefix0`
      : searchCondition.query
          .split(" ")
          .map((_, index) => `(' ' || COALESCE(${name}, '') || ' ') LIKE :searchTokenPrefix${index}`)
          .join(" AND ");
    const synonymKeys = Object.keys(searchCondition.parameters).filter((key) =>
      key.startsWith("searchSynonym"),
    );
    const aliasMatch = synonymKeys.length
      ? synonymKeys
          .map((key) => `(' ' || COALESCE(${name}, '') || ' ') LIKE :${key}`)
          .join(" OR ")
      : "FALSE";
    return `CASE
      WHEN ${name} = :searchExact THEN 1000
      WHEN ${name} LIKE :searchPrefix THEN 900
      WHEN ${namePrefix} THEN 800
      WHEN (${aliasMatch}) THEN 800
      WHEN ${nameBoundary} THEN 700
      ELSE 0
    END`;
  }

  private buildProductSearchParameters(
    searchCondition: ReturnType<typeof buildCatalogSearchCondition>,
    resolvedFilters?: ResolvedSearchFilters,
  ): Record<string, string | number | number[] | string[]> {
    return {
      ...(searchCondition?.parameters ?? {}),
      ...(resolvedFilters?.categoryIds.length
        ? { resolvedCategoryIds: resolvedFilters.categoryIds }
        : {}),
      ...(resolvedFilters?.subcategoryIds.length
        ? { resolvedSubcategoryIds: resolvedFilters.subcategoryIds }
        : {}),
      ...(resolvedFilters?.brandNames.length
        ? { resolvedBrandNames: resolvedFilters.brandNames }
        : {}),
    };
  }

  private async searchCategories(
    manager: EntityManager,
    query: string,
    limit: number,
    approvedAliases: string[] = [],
  ) {
    if (limit === 0) return [];
    const candidates = [...new Set([...buildSearchCandidates(query), ...approvedAliases.map(normalizeSearchQuery)])];
    const candidateParameters = Object.fromEntries(
      candidates.map((candidate, index) => [`categoryCandidate${index}`, `% ${candidate}%`]),
    );
    const candidateWhere = candidates
      .map((_, index) => `(' ' || regexp_replace(lower(COALESCE(category.name, '')), '[^[:alnum:]]+', ' ', 'g') || ' ') LIKE :categoryCandidate${index}`)
      .join(" OR ");
    const rows = await manager
      .getRepository(Category)
      .createQueryBuilder("category")
      .where(
        `(${candidateWhere}) OR similarity(LOWER(category.name), :exact) >= :threshold`,
        {
          ...candidateParameters,
          exact: query,
      threshold: query.length < 4 ? 0.55 : 0.35,
        },
      )
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

  private async searchSubcategories(
    manager: EntityManager,
    query: string,
    limit: number,
    approvedAliases: string[] = [],
  ): Promise<TaxonomySuggestion[]> {
    if (limit === 0) return [];
    const candidates = [...new Set([...buildSearchCandidates(query), ...approvedAliases.map(normalizeSearchQuery)])];
    const candidateParameters = Object.fromEntries(
      candidates.map((candidate, index) => [`subcategoryCandidate${index}`, `% ${candidate}%`]),
    );
    const candidateWhere = candidates
      .map((_, index) => `(' ' || regexp_replace(lower(COALESCE(subcategory.name, '')), '[^[:alnum:]]+', ' ', 'g') || ' ') LIKE :subcategoryCandidate${index}`)
      .join(" OR ");
    const rows = await manager
      .getRepository(Subcategory)
      .createQueryBuilder("subcategory")
      .where(
        `(${candidateWhere}) OR similarity(LOWER(subcategory.name), :exact) >= :threshold`,
        {
          ...candidateParameters,
          exact: query,
          threshold: query.length < 4 ? 0.55 : 0.35,
        },
      )
      .select("subcategory.id", "id")
      .addSelect("subcategory.name", "name")
      .addSelect("subcategory.image", "image")
      .orderBy(
        "CASE WHEN LOWER(subcategory.name) = :exact THEN 0 WHEN LOWER(subcategory.name) LIKE :prefix THEN 1 ELSE 2 END",
        "ASC",
      )
      .addOrderBy("subcategory.name", "ASC")
      .setParameters({ exact: query, prefix: `${query}%` })
      .limit(limit)
      .getRawMany<{ id: string; name: string; image: string | null }>();

    return rows.map((row) => ({
      id: Number(row.id),
      name: row.name,
      image: row.image,
    }));
  }

  private async searchBrands(
    manager: EntityManager,
    query: string,
    limit: number,
    approvedAliases: string[] = [],
  ) {
    if (limit === 0) return [];
    const candidates = [...new Set([...buildSearchCandidates(query), ...approvedAliases.map(normalizeSearchQuery)])];
    const candidateParameters = Object.fromEntries(
      candidates.map((candidate, index) => [`brandCandidate${index}`, `% ${candidate}%`]),
    );
    const candidateWhere = candidates
      .map((_, index) => `(' ' || regexp_replace(lower(COALESCE(product.brand, '')), '[^[:alnum:]]+', ' ', 'g') || ' ') LIKE :brandCandidate${index}`)
      .join(" OR ");
    const rows = await manager
      .getRepository(Product)
      .createQueryBuilder("product")
      .where("product.deletedAt IS NULL")
      .andWhere("product.brand IS NOT NULL")
      .andWhere(
        `(${candidateWhere}) OR similarity(LOWER(product.brand), :exact) >= :threshold`,
        {
          ...candidateParameters,
          exact: query,
          threshold: query.length < 4 ? 0.55 : 0.35,
        },
      )
      .select("MIN(product.id)", "id")
      .addSelect("product.brand", "name")
      .groupBy("product.brand")
      .orderBy(
        "CASE WHEN LOWER(product.brand) = :exact THEN 0 WHEN LOWER(product.brand) LIKE :prefix THEN 1 ELSE 2 END",
        "ASC",
      )
      .addOrderBy("similarity(LOWER(product.brand), :exact)", "DESC")
      .addOrderBy("product.brand", "ASC")
      .setParameters({ exact: query, prefix: `${query}%` })
      .limit(limit)
      .getRawMany<{ id: string; name: string }>();

    return rows.map((row) => ({ id: Number(row.id), name: row.name }));
  }

  private async countProducts(
    manager: EntityManager,
    searchCondition: ReturnType<typeof buildCatalogSearchCondition>,
    resolvedFilters?: ResolvedSearchFilters,
    runtimeFilters?: CatalogRuntimeFilters,
  ) {
    const requiresAggregateFilters = Boolean(
      runtimeFilters && (
        runtimeFilters.input.minPrice !== undefined ||
        runtimeFilters.input.maxPrice !== undefined ||
        runtimeFilters.input.minRating !== undefined
      ),
    );
    const query = manager
      .getRepository(Product)
      .createQueryBuilder("product")
      .leftJoin("product.subcategory", "subcategory")
      .leftJoin("subcategory.category", "category")
      .where("product.deletedAt IS NULL")
      .andWhere(
        this.buildProductSearchWhere(
          searchCondition,
          resolvedFilters,
          searchCondition ? this.buildTaxonomyTextWhere(searchCondition) : "FALSE",
        ),
        this.buildProductSearchParameters(searchCondition, resolvedFilters),
      );
    if (runtimeFilters) query.leftJoin("product.deal", "deal");
    if (!requiresAggregateFilters) {
      this.applyAdvancedFilters(query, runtimeFilters);
      return query.getCount();
    }
    query
      .leftJoin("product.variants", "variants", "variants.deletedAt IS NULL")
      .leftJoin(
        `(${manager.getRepository(Review).createQueryBuilder("review").select("review.productId", "product_id").addSelect("AVG(review.rating)", "average_rating").groupBy("review.productId").getQuery()})`,
        "rating",
        "rating.product_id = product.id",
      );
    query.select("product.id", "id").groupBy("product.id").addGroupBy("rating.product_id").addGroupBy("rating.average_rating");
    this.applyAdvancedFilters(query, runtimeFilters);
    return (await query.getRawMany()).length;
  }
}
