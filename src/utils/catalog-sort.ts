/**
 * Percentage saved by a catalog card. Prices are persisted after product and
 * deal discounts, so this must be derived from the displayed base/final pair
 * instead of the individual discount fields. Those fields can be legacy or
 * represent only one part of a stacked discount.
 */
export const buildCatalogDiscountPercentExpression = (): string => {
  const basePrice = `COALESCE(
    NULLIF("variants"."basePrice", 0),
    NULLIF("product"."basePrice", 0),
    0
  )`;
  const finalPrice = `COALESCE(
    NULLIF("variants"."finalPrice", 0),
    NULLIF("product"."finalPrice", 0),
    ${basePrice}
  )`;

  return `MAX(
    CASE
      WHEN ${basePrice} > 0 THEN
        ((${basePrice} - LEAST(${finalPrice}, ${basePrice})) / ${basePrice}) * 100.0
      ELSE 0
    END
  )`;
};
