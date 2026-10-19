import { DiscountType } from "../entities/product.enum";
import { calculatePriceSnapshot, normalizeDiscountType } from "./pricing.utils";

export type LegacyPricingRecord = {
  basePrice?: number | string | null;
  discount?: number | string | null;
  discountType?: DiscountType | string | null;
};

export const normalizeLegacyPricingRecord = (record: LegacyPricingRecord) => {
  const basePrice = Number(record.basePrice ?? 0);
  const discount = Number(record.discount ?? 0);
  const discountType = normalizeDiscountType(record.discountType);
  if (basePrice <= 0 || discount <= 0 || discountType === DiscountType.NONE) return null;

  const snapshot = calculatePriceSnapshot({ basePrice, discount, discountType });
  return {
    discountAmount: snapshot.discountAmount,
    discountPercent: Number(((snapshot.discountAmount / basePrice) * 100).toFixed(2)),
    discountType,
    finalPrice: snapshot.finalPrice,
  };
};

export const normalizeUnlinkedPercentageReduction = (record: {
  basePrice?: number | string | null;
  finalPrice?: number | string | null;
}) => {
  const basePrice = Number(record.basePrice ?? 0);
  const finalPrice = Number(record.finalPrice ?? 0);
  if (basePrice <= 0 || finalPrice <= 0 || finalPrice >= basePrice) return null;

  const discountPercent = Number((((basePrice - finalPrice) / basePrice) * 100).toFixed(2));
  const snapshot = calculatePriceSnapshot({
    basePrice,
    discount: discountPercent,
    discountType: DiscountType.PERCENTAGE,
  });
  // Existing displayed price must be exactly reproducible. Otherwise source
  // is ambiguous (rounding/manual price) and caller must skip it.
  if (snapshot.finalPrice !== finalPrice) return null;

  return {
    discount: discountPercent,
    discountAmount: snapshot.discountAmount,
    discountPercent,
    discountType: DiscountType.PERCENTAGE,
    finalPrice,
  };
};
