import { normalizeSearchQuery } from "./normalize-search-query";

export interface SearchableVariant {
  sku?: string | null;
  attributes?: Record<string, string | number | boolean | null | undefined> | null;
}

export interface SearchableProduct {
  name: string;
  brandName?: string | null;
  categoryName?: string | null;
  subcategoryName?: string | null;
  keywords?: string | string[] | null;
  variants?: SearchableVariant[] | null;
}

const valuesFor = (value?: string | string[] | null): string[] =>
  Array.isArray(value) ? value : value ? [value] : [];

export function buildProductSearchText(product: SearchableProduct): string {
  const values = [
    product.name,
    product.brandName,
    product.categoryName,
    product.subcategoryName,
    ...valuesFor(product.keywords),
    ...(product.variants ?? []).flatMap((variant) => [
      variant.sku,
      ...Object.values(variant.attributes ?? {}),
    ]),
  ];

  const normalizedValues = normalizeSearchQuery(
    values.filter((value): value is string | number | boolean => value !== null && value !== undefined).join(" "),
  ).split(" ");

  return [...new Set(normalizedValues)].join(" ");
}
