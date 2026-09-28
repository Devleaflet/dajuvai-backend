import type { AgeRestriction } from "../service/age-restriction.service";
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
  slug: string;
  name: string;
  image?: string | null;
}

export interface BrandSuggestion {
  id: number;
  name: string;
}

export interface ProductSearchResult {
  id: number;
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  effectivePrice: number;
  originalPrice: number;
  discountPercentage: number;
  averageRating: number;
  totalReviews: number;
  inStock: boolean;
  matchedVariant: null;
  /**
   * The category's gate, carried on the result itself.
   *
   * Same shape `withAgeRestriction` attaches everywhere else, so a search
   * result card and a category listing card read it identically. Search used
   * not to project it at all, which left every result reporting itself
   * unrestricted.
   */
  ageRestriction: AgeRestriction;
}

/**
 * A product as autocomplete returns it.
 *
 * Narrower than `ProductSearchResult` on purpose: rating and review counts cost
 * two grouped scans over every review and order item in the system, and a
 * suggestion row — a thumbnail, a name and a price — has nowhere to show them.
 */
export interface SuggestionProductResult {
  id: number;
  slug: string;
  name: string;
  thumbnailUrl: string | null;
  effectivePrice: number;
  originalPrice: number;
  discountPercentage: number;
  inStock: boolean;
}

/**
 * One row of a facet list: the thing, and how many matches are in it.
 *
 * `id` is the taxonomy id for categories and subcategories, and the brand's own
 * name for brands — brands are a product column here rather than a table, so
 * the name is the only identifier they have.
 */
export interface CatalogFacetValue {
  id: number | string;
  /** Categories and subcategories only; brands have no table, so no slug. */
  slug?: string;
  label: string;
  count: number;
}

export interface CatalogFacets {
  categories: CatalogFacetValue[];
  subcategories: CatalogFacetValue[];
  brands: CatalogFacetValue[];
}

export interface SearchCatalogResponse {
  query: string;
  normalizedQuery: string;
  resolvedFilters: ResolvedSearchFilters;
  products: ProductSearchResult[];
  categories: TaxonomySuggestion[];
  subcategories: TaxonomySuggestion[];
  brands: BrandSuggestion[];
  /** Counts for the current query, for filter controls that show them. */
  facets: CatalogFacets;
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
