import { describe, expect, it, vi } from "vitest";

import {
  applyPublicCatalogVisibility,
  publicCatalogVisibilityWhere,
  VENDOR_ALIAS,
} from "./catalog-visibility";

describe("publicCatalogVisibilityWhere", () => {
  it("requires the product to be live and its vendor approved and verified", () => {
    const where = publicCatalogVisibilityWhere();

    expect(where).toContain("product.deletedAt IS NULL");
    expect(where).toContain(`${VENDOR_ALIAS}.id IS NOT NULL`);
    expect(where).toContain(`${VENDOR_ALIAS}.isApproved = TRUE`);
    expect(where).toContain(`${VENDOR_ALIAS}.isVerified = TRUE`);
  });

  it("joins every rule with AND", () => {
    // An OR anywhere in here would make the predicate a suggestion rather than
    // a guard, and the failure would be silent.
    expect(publicCatalogVisibilityWhere()).not.toMatch(/\bOR\b/);
  });

  it("does not filter on product status", () => {
    // AVAILABLE / LOW_STOCK / OUT_OF_STOCK are the whole enum; there is no
    // draft state, and hiding out-of-stock rows would shrink the catalogue.
    expect(publicCatalogVisibilityWhere()).not.toContain("status");
  });

  it("honours a caller's product alias", () => {
    expect(publicCatalogVisibilityWhere("p")).toContain("p.deletedAt IS NULL");
  });
});

describe("applyPublicCatalogVisibility", () => {
  it("joins the vendor and applies the rules to the same builder", () => {
    // The join and the WHERE are only correct together: the predicate names an
    // alias that does not exist unless the join was made.
    const query = { leftJoin: vi.fn(), andWhere: vi.fn() };
    query.leftJoin.mockReturnValue(query);
    query.andWhere.mockReturnValue(query);

    applyPublicCatalogVisibility(query as never);

    expect(query.leftJoin).toHaveBeenCalledWith("product.vendor", VENDOR_ALIAS);
    expect(query.andWhere).toHaveBeenCalledWith(publicCatalogVisibilityWhere());
  });
});
