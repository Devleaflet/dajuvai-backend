import { Repository } from "typeorm";
import AppDataSource from "../config/db.config";
import { District } from "../entities/district.entity";
import { APIError } from "../utils/ApiError.utils";

export const SAME_DISTRICT_FEE = 100;
export const CROSS_DISTRICT_FEE = 200;

export enum ShippingZone {
  SAME_DISTRICT = "SAME_DISTRICT",
  CROSS_DISTRICT = "CROSS_DISTRICT",
}

export interface DistrictRef {
  districtId?: number | null;
  districtName?: string | null;
}

export interface VendorShippingResult {
  vendorId: number;
  vendorDistrict: string;
  customerDistrict: string;
  shippingZone: ShippingZone;
  shippingFee: number;
}

/**
 * Normalizes a district name for fallback string comparison: trims,
 * collapses whitespace, lowercases, and drops a trailing "district" word
 * so "Kathmandu", "kathmandu", "Kathmandu District", " KATHMANDU " all match.
 */
export function normalizeDistrictName(name?: string | null): string {
  if (!name) return "";
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s*district$/, "")
    .trim();
}

/**
 * Order grand total = merchandise subtotal + shipping total - discount + tax.
 * The one formula every checkout/order/estimate call site uses — never
 * reimplemented inline.
 */
export function calculateGrandTotal(input: {
  merchandiseSubtotal: number;
  shippingTotal: number;
  discountTotal: number;
  taxTotal: number;
}): number {
  return (
    input.merchandiseSubtotal - input.discountTotal + input.shippingTotal + input.taxTotal
  );
}

/**
 * Determine same-district vs cross-district for one vendor against the
 * customer's delivery district. Prefers ID comparison (district FK on both
 * sides); falls back to normalized-name comparison only when an ID isn't
 * available on one side. Pure function — no DB access — so it's directly
 * unit-testable.
 */
export function calculateVendorZone(
  customer: DistrictRef,
  vendor: DistrictRef,
): { zone: ShippingZone; fee: number } {
  if (!customer.districtName && customer.districtId == null) {
    throw new APIError(400, "Customer district is required for shipping calculation");
  }
  if (!vendor.districtName && vendor.districtId == null) {
    throw new APIError(400, "Vendor district is required for shipping calculation");
  }

  let sameDistrict: boolean;
  if (customer.districtId != null && vendor.districtId != null) {
    sameDistrict = customer.districtId === vendor.districtId;
  } else {
    sameDistrict =
      normalizeDistrictName(customer.districtName) ===
      normalizeDistrictName(vendor.districtName);
  }

  const zone = sameDistrict ? ShippingZone.SAME_DISTRICT : ShippingZone.CROSS_DISTRICT;
  return { zone, fee: sameDistrict ? SAME_DISTRICT_FEE : CROSS_DISTRICT_FEE };
}

/**
 * Compute the full per-vendor shipping breakdown for an order.
 * `vendorGroups` must be grouped by vendorId (one entry per vendor), never
 * by district. Pure function — no DB access — so it's directly unit-testable.
 */
export function calculateOrderShipping(
  customer: DistrictRef,
  vendorGroups: {
    vendorId: number;
    vendorDistrict: DistrictRef;
  }[],
): { vendorShippingBreakdown: VendorShippingResult[]; shippingTotal: number } {
  const vendorShippingBreakdown = vendorGroups.map((group) => {
    const { zone, fee } = calculateVendorZone(customer, group.vendorDistrict);
    return {
      vendorId: group.vendorId,
      vendorDistrict: group.vendorDistrict.districtName || "",
      customerDistrict: customer.districtName || "",
      shippingZone: zone,
      shippingFee: fee,
    };
  });

  const shippingTotal = vendorShippingBreakdown.reduce(
    (sum, v) => sum + v.shippingFee,
    0,
  );

  return { vendorShippingBreakdown, shippingTotal };
}

/**
 * Single source of truth for per-vendor shipping-fee calculation.
 * Every caller (checkout, order read models, invoices, emails) must go
 * through this service instead of re-implementing the district check.
 */
export class ShippingCalculationService {
  private districtRepository: Repository<District>;

  constructor() {
    this.districtRepository = AppDataSource.getRepository(District);
  }

  /** Resolve a district row by normalized name; null if no match. */
  async resolveDistrictByName(name?: string | null): Promise<District | null> {
    const normalized = normalizeDistrictName(name);
    if (!normalized) return null;

    const districts = await this.districtRepository.find();
    return (
      districts.find((d) => normalizeDistrictName(d.name) === normalized) ??
      null
    );
  }

  calculateVendorZone(customer: DistrictRef, vendor: DistrictRef) {
    return calculateVendorZone(customer, vendor);
  }

  calculateOrderShipping(
    customer: DistrictRef,
    vendorGroups: { vendorId: number; vendorDistrict: DistrictRef }[],
  ) {
    return calculateOrderShipping(customer, vendorGroups);
  }
}
