import { BadRequestError } from "../errors";
import type { CatalogSort, IProductQueryParams } from "../interface/product.interface";
import { normalizeSearchQuery } from "../search/normalize-search-query";

type QueryValue = string | string[] | undefined;
type QueryInput = Record<string, QueryValue>;

const SORT_ALIASES: Record<string, CatalogSort> = {
  all: "newest",
  newest: "newest",
  relevance: "relevance",
  rating: "rating",
  "low-to-high": "price_low_high",
  price_low_high: "price_low_high",
  "high-to-low": "price_high_low",
  price_high_low: "price_high_low",
  discount_high_low: "discount_high_low",
  best_selling: "best_selling",
};

const valuesOf = (value: QueryValue): string[] =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((entry) => entry.split(","))
    .map((entry) => entry.trim())
    .filter(Boolean);

const parseIdList = (value: QueryValue, field: string): number[] => {
  const ids = valuesOf(value).map((entry) => {
    if (!/^\d+$/.test(entry) || Number(entry) < 1) {
      throw new BadRequestError(`${field} must contain positive integer IDs`);
    }
    return Number(entry);
  });

  return [...new Set(ids)];
};

const parseNumber = (
  value: QueryValue,
  field: string,
  options: { min?: number; max?: number; integer?: boolean } = {},
): number | undefined => {
  const entries = valuesOf(value);
  if (entries.length === 0) return undefined;
  if (entries.length !== 1 || !/^(?:\d+|\d+\.\d+)$/.test(entries[0])) {
    throw new BadRequestError(`${field} must be a valid number`);
  }

  const parsed = Number(entries[0]);
  if (
    !Number.isFinite(parsed) ||
    (options.integer && !Number.isInteger(parsed)) ||
    (options.min !== undefined && parsed < options.min) ||
    (options.max !== undefined && parsed > options.max)
  ) {
    throw new BadRequestError(`${field} is outside the allowed range`);
  }

  return parsed;
};

const parseBoolean = (value: QueryValue, field: string): boolean | undefined => {
  const entries = valuesOf(value);
  if (entries.length === 0) return undefined;
  if (entries.length !== 1 || !["true", "false"].includes(entries[0])) {
    throw new BadRequestError(`${field} must be true or false`);
  }
  return entries[0] === "true";
};

export const buildCatalogTaxonomyFilter = (
  categoryIds: number[],
  subcategoryIds: number[],
): { condition: string; parameters: Record<string, number[]> } | undefined => {
  if (categoryIds.length && subcategoryIds.length) {
    return {
      condition:
        "(subcategory.categoryId IN (:...categoryIds) OR product.subcategoryId IN (:...subcategoryIds))",
      parameters: { categoryIds, subcategoryIds },
    };
  }
  if (categoryIds.length) {
    return {
      condition: "subcategory.categoryId IN (:...categoryIds)",
      parameters: { categoryIds },
    };
  }
  if (subcategoryIds.length) {
    return {
      condition: "product.subcategoryId IN (:...subcategoryIds)",
      parameters: { subcategoryIds },
    };
  }
  return undefined;
};

export const normalizeCatalogQuery = (query: QueryInput): IProductQueryParams => {
  const categoryIds = parseIdList(query.categoryId ?? query.categoryIds, "categoryId");
  const subcategoryIds = parseIdList(
    query.subcategoryId ?? query.subcategoryIds,
    "subcategoryId",
  );
  const minPrice = parseNumber(query.minPrice, "minPrice", { min: 0 });
  const maxPrice = parseNumber(query.maxPrice, "maxPrice", { min: 0 });
  const minRating = parseNumber(query.minRating, "minRating", { min: 1, max: 5 });
  const page = parseNumber(query.page, "page", { min: 1, integer: true }) ?? 1;
  const limit = parseNumber(query.limit, "limit", {
    min: 1,
    max: 48,
    integer: true,
  }) ?? 40;
  const hasDeal = parseBoolean(query.hasDeal, "hasDeal");
  const sortValue = valuesOf(query.sort)[0] ?? "newest";
  const sort = SORT_ALIASES[sortValue];

  if (!sort) {
    throw new BadRequestError("sort is not supported");
  }
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) {
    throw new BadRequestError("minimum price cannot exceed maximum price");
  }

  const rawSearch = valuesOf(query.q)[0] ?? valuesOf(query.search)[0] ?? "";
  if (rawSearch.length > 80) {
    throw new BadRequestError("search must be 80 characters or fewer");
  }
  const search = normalizeSearchQuery(rawSearch);
  if (rawSearch.trim() && !search) {
    throw new BadRequestError("search must contain searchable characters");
  }

  const dealIds = parseIdList(query.dealId ?? query.dealIds, "dealId");
  const bannerId = parseNumber(query.bannerId, "bannerId", { min: 1, integer: true });
  const vendorId = valuesOf(query.vendorId)[0];

  return {
    categoryIds,
    subcategoryIds,
    minPrice,
    maxPrice,
    minRating,
    hasDeal,
    sort: sort === "relevance" && !search ? "newest" : sort,
    page,
    limit,
    ...(search && { search }),
    ...(dealIds.length && { dealIds }),
    ...(bannerId !== undefined && { bannerId }),
    ...(vendorId && { vendorId }),
  };
};
