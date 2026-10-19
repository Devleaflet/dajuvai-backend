import { InventoryStatus } from "../entities/product.enum";

export interface InventoryAlertVariant {
  stock?: number | null;
  deletedAt?: Date | null;
}

export interface InventoryAlertProduct {
  hasVariants?: boolean;
  stock?: number | null;
  variants?: InventoryAlertVariant[];
}

function stockState(stock: number | null | undefined): InventoryStatus {
  const quantity = Number(stock) || 0;
  if (quantity <= 0) return InventoryStatus.OUT_OF_STOCK;
  if (quantity < 5) return InventoryStatus.LOW_STOCK;
  return InventoryStatus.AVAILABLE;
}

export function getEffectiveInventoryState(
  product: InventoryAlertProduct,
): InventoryStatus {
  if (!product.hasVariants) return stockState(product.stock);

  const activeVariants = (product.variants ?? []).filter(
    (variant) => !variant.deletedAt,
  );
  if (activeVariants.length === 0) return InventoryStatus.OUT_OF_STOCK;
  return stockState(
    activeVariants.reduce(
      (total, variant) => total + (Number(variant.stock) || 0),
      0,
    ),
  );
}

export function getVendorInventoryAlertCounts(products: InventoryAlertProduct[]) {
  return products.reduce(
    (counts, product) => {
      const state = getEffectiveInventoryState(product);
      if (state === InventoryStatus.OUT_OF_STOCK) counts.outOfStockCount += 1;
      if (state === InventoryStatus.LOW_STOCK) counts.lowStockCount += 1;
      return counts;
    },
    { lowStockCount: 0, outOfStockCount: 0 },
  );
}
