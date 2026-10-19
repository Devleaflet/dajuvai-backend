import { z } from "zod";

import { normalizeSearchQuery } from "./normalize-search-query";

/**
 * What a storefront may report about a search.
 *
 * Deliberately the smallest payload that closes the learning loop: the query,
 * what the shopper did, and which catalogue row they did it to. No user id, no
 * session id, no free text — this endpoint is unauthenticated, so anything it
 * accepted would be a field an anonymous caller could write into the database.
 *
 * `recordSearch` already counts searches and zero-result searches from the
 * server side. This is the other half: outcomes, which only the client can see.
 * Without it `recordOutcome` had no callers at all and the alias-candidate
 * table could never fill.
 */
export const searchEventSchema = z.object({
  q: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .refine(
      (value) => normalizeSearchQuery(value).length >= 2,
      "q must contain at least two searchable characters",
    ),
  /**
   * Weighted by the alias-candidate threshold, not here: a purchase and a click
   * are both "positive", and deciding that a purchase is worth more belongs
   * with the promotion rule rather than in a payload a client controls.
   */
  outcome: z.enum(["CLICK", "ADD_TO_CART", "PURCHASE"]),
  targetType: z.enum(["PRODUCT", "CATEGORY", "SUBCATEGORY"]),
  targetId: z.coerce.number().int().positive(),
});

export type SearchEventInput = z.infer<typeof searchEventSchema>;
