import { z } from "zod";
import { normalizeSearchQuery } from "./normalize-search-query";

export const searchSuggestionSchema = z.object({
  q: z.string().trim().min(2).max(80).refine(
    (value) => normalizeSearchQuery(value).length >= 2,
    "q must contain at least two searchable characters",
  ),
  productLimit: z.coerce.number().int().min(1).max(8).default(6),
  categoryLimit: z.coerce.number().int().min(0).max(4).default(3),
  // Subcategories are where a shopper's words usually land — "sneakers" is a
  // subcategory, "footwear" is the category above it — so they get the same
  // budget as the departments and are worth surfacing beside them.
  subcategoryLimit: z.coerce.number().int().min(0).max(4).default(3),
  brandLimit: z.coerce.number().int().min(0).max(4).default(3),
});

export type SearchSuggestionInput = z.infer<typeof searchSuggestionSchema>;
