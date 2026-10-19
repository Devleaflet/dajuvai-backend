import { Product } from "../entities/product.entity";

export const DEFAULT_MINIMUM_AGE = 18;

export type AgeRestriction = {
  isRestricted: boolean;
  minimumAge: number | null;
  restrictionMessage: string | null;
};

type RestrictableProduct = Pick<Product, "id"> & {
  subcategory?: { category?: { isAgeRestricted?: boolean; minimumAge?: number | null; restrictionMessage?: string | null } | null } | null;
};

export function resolveProductAgeRestriction(product: RestrictableProduct): AgeRestriction {
  const category = product.subcategory?.category;
  if (!category?.isAgeRestricted) {
    return { isRestricted: false, minimumAge: null, restrictionMessage: null };
  }
  const parsedAge = Number(category.minimumAge);
  return {
    isRestricted: true,
    minimumAge: Number.isInteger(parsedAge) && parsedAge > 0 ? parsedAge : DEFAULT_MINIMUM_AGE,
    restrictionMessage: category.restrictionMessage?.trim() || null,
  };
}

export function getAgeRestrictionSummary(products: RestrictableProduct[]) {
  const restricted = products.map((product) => ({ product, restriction: resolveProductAgeRestriction(product) }))
    .filter(({ restriction }) => restriction.isRestricted);
  return {
    containsRestrictedItems: restricted.length > 0,
    minimumRequiredAge: restricted.length ? Math.max(...restricted.map(({ restriction }) => restriction.minimumAge ?? DEFAULT_MINIMUM_AGE)) : null,
    restrictedProductIds: restricted.map(({ product }) => product.id),
  };
}

export function withAgeRestriction<T extends RestrictableProduct>(product: T): T & { ageRestriction: AgeRestriction } {
  return { ...product, ageRestriction: resolveProductAgeRestriction(product) };
}
