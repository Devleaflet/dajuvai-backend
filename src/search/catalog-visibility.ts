import type { SelectQueryBuilder } from "typeorm";

/**
 * What makes a product visible to the public catalogue.
 *
 * One definition, because the alternative is what this file was written to fix:
 * every public read spelled out `product.deletedAt IS NULL` and stopped there,
 * so search returned products belonging to vendors who had never been approved.
 *
 * The rules, and why each is exactly these columns and no others:
 *
 * - **The product is not soft-deleted.** The existing guard, kept.
 * - **The product has a vendor.** An orphaned row is a data fault, not a
 *   listing; `vendorId` is not nullable in practice but a `LEFT JOIN` makes the
 *   check free, and a row whose vendor has been hard-deleted must not survive
 *   as an unattributable product.
 * - **The vendor is approved.** `isApproved` is the admin's deliberate "this
 *   business may sell" switch. It is also how account deletion hides a shop:
 *   `requestVendorDeletion` sets `isApproved = false`, stashing the old value
 *   in `deletionPreviousApproval` so cancelling restores it. That is why
 *   `deletionScheduledFor` is *not* tested here — it would be redundant, and a
 *   second rule that can disagree with the first is worse than one rule.
 * - **The vendor is verified.** `isVerified` is the vendor's own email
 *   confirmation, and the unverified-vendor cleanup cron treats an unverified
 *   vendor as one that should not exist. Approved-but-unverified is a
 *   transient state, not a sellable one.
 *
 * Deliberately *not* included: product status. `AVAILABLE`, `LOW_STOCK` and
 * `OUT_OF_STOCK` are the only values in the enum — there is no draft or hidden
 * state to honour, and treating `OUT_OF_STOCK` as invisible would hide stock
 * that is about to be replenished. Stock is ranked, not filtered.
 */

/** The alias this module's SQL expects the vendor to be joined under. */
export const VENDOR_ALIAS = "catalogVendor";

/**
 * Joins the vendor and applies the visibility rules.
 *
 * A single call rather than a join helper plus a where helper, because the two
 * are only correct together: the `WHERE` references an alias that does not
 * exist unless the join was made, and the join on its own silently changes
 * nothing.
 *
 * `leftJoin`, not `innerJoin`, so the missing-vendor case is a rule stated in
 * the `WHERE` alongside the others rather than an invisible consequence of the
 * join type.
 */
export function applyPublicCatalogVisibility<T extends object>(
  query: SelectQueryBuilder<T>,
  productAlias = "product",
): SelectQueryBuilder<T> {
  return query
    .leftJoin(`${productAlias}.vendor`, VENDOR_ALIAS)
    .andWhere(publicCatalogVisibilityWhere(productAlias));
}

/**
 * The rules as a bare SQL fragment, for a builder that has already joined the
 * vendor itself or composes its `WHERE` by hand.
 */
export function publicCatalogVisibilityWhere(productAlias = "product"): string {
  return `(
    ${productAlias}.deletedAt IS NULL
    AND ${VENDOR_ALIAS}.id IS NOT NULL
    AND ${VENDOR_ALIAS}.isApproved = TRUE
    AND ${VENDOR_ALIAS}.isVerified = TRUE
  )`;
}
