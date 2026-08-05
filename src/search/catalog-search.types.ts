import { z } from "zod";

const queryBoolean = z.preprocess(
  (value) => value === "true" ? true : value === "false" ? false : value,
  z.boolean(),
);
const positiveIdList = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      const values = value.split(",").map((item) => item.trim()).filter(Boolean);
      return values.length ? values : undefined;
    }
    if (Array.isArray(value)) {
      const values = value.filter((item) => String(item).trim() !== "");
      return values.length ? values : undefined;
    }
    return value;
  },
  z.coerce.number().int().positive().array().or(z.coerce.number().int().positive()).optional(),
);

export const searchCatalogSchema = z.object({
  q: z.string().trim().max(80).default(""),
  mode: z.enum(["suggest", "catalog"]).default("catalog"),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(48).default(40),
  categoryIds: positiveIdList,
  subcategoryIds: positiveIdList,
  brand: z.string().trim().max(120).optional(),
  minPrice: z.coerce.number().finite().min(0).optional(),
  maxPrice: z.coerce.number().finite().min(0).optional(),
  minRating: z.coerce.number().finite().min(1).max(5).optional(),
  hasDeal: queryBoolean.optional(),
  dealIds: positiveIdList,
  bannerId: z.coerce.number().int().positive().optional(),
  sort: z.enum(["relevance", "newest", "rating", "price_low_high", "price_high_low", "discount_high_low", "best_selling"]).default("relevance"),
}).superRefine((input, context) => {
  if (input.minPrice !== undefined && input.maxPrice !== undefined && input.minPrice > input.maxPrice) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "minPrice cannot exceed maxPrice", path: ["minPrice"] });
  }
});

export type SearchCatalogInput = z.infer<typeof searchCatalogSchema>;

export interface ResolvedSearchFilters {
  categoryIds: number[];
  subcategoryIds: number[];
  brandNames: string[];
  keyword: string | null;
}

export interface TaxonomySuggestion {
  id: number;
  name: string;
  image?: string | null;
}

export interface BrandSuggestion {
  id: number;
  name: string;
}

export interface ProductSearchResult {
  id: number;
  name: string;
  thumbnailUrl: string | null;
  effectivePrice: number;
  originalPrice: number;
  discountPercentage: number;
  averageRating: number;
  totalReviews: number;
  inStock: boolean;
  matchedVariant: null;
}

export interface SearchCatalogResponse {
  query: string;
  normalizedQuery: string;
  resolvedFilters: ResolvedSearchFilters;
  products: ProductSearchResult[];
  categories: TaxonomySuggestion[];
  subcategories: TaxonomySuggestion[];
  brands: BrandSuggestion[];
  totalProducts: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function mergeResolvedFilters(
  first: ResolvedSearchFilters,
  second: ResolvedSearchFilters,
): ResolvedSearchFilters {
  return {
    categoryIds: [...new Set([...first.categoryIds, ...second.categoryIds])],
    subcategoryIds: [...new Set([...first.subcategoryIds, ...second.subcategoryIds])],
    brandNames: [...new Set([...first.brandNames, ...second.brandNames])],
    keyword: first.keyword ?? second.keyword ?? null,
  };
}

/**
 * Search suggestions are ranked, but returning every suggestion as a filter
 * widens a catalog query into an unintended OR across unrelated categories.
 * Keep explicit filters intact and promote only the strongest taxonomy family.
 * Category wins over subcategory, which wins over brand, preventing fuzzy
 * suggestions from widening the catalog into unrelated branches.
 */
export function pickPrimaryResolvedFilters(
  categories: TaxonomySuggestion[],
  subcategories: TaxonomySuggestion[],
  brands: BrandSuggestion[],
): ResolvedSearchFilters {
  if (categories.length) {
    return {
      categoryIds: [categories[0].id],
      subcategoryIds: [],
      brandNames: [],
      keyword: null,
    };
  }
  if (subcategories.length) {
    return {
      categoryIds: [],
      subcategoryIds: [subcategories[0].id],
      brandNames: [],
      keyword: null,
    };
  }
  return {
    categoryIds: [],
    subcategoryIds: [],
    brandNames: brands.slice(0, 1).map(({ name }) => name),
    keyword: null,
  };
}
