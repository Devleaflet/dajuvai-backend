import AppDataSource from "../config/db.config";
import { Deal, DealStatus } from "../entities/deal.entity";
import { Product } from "../entities/product.entity";
import { Variant } from "../entities/variant.entity";
import { DiscountType } from "../entities/product.enum";
import { calculatePriceSnapshot } from "../utils/pricing.utils";
import { normalizeLegacyPricingRecord, normalizeUnlinkedPercentageReduction } from "../utils/legacy-pricing-backfill";

const apply = process.argv.includes("--apply");

type Counts = Record<string, number>;
const counts: Counts = { products: 0, variants: 0, deals: 0, legacy: 0, skipped: 0 };
const skipped: Array<{ entity: "product" | "variant"; id: number; reason: string }> = [];

const hasLegacyDiscount = (value: { discount?: unknown; discountAmount?: unknown; discountPercent?: unknown }) =>
  Number(value.discount ?? 0) > 0 && Number(value.discountAmount ?? 0) === 0 && Number(value.discountPercent ?? 0) === 0;

const hasUnclassifiedReduction = (value: { basePrice?: unknown; finalPrice?: unknown; discount?: unknown; discountAmount?: unknown; discountPercent?: unknown }) =>
  Number(value.basePrice ?? 0) > Number(value.finalPrice ?? value.basePrice ?? 0) &&
  Number(value.discount ?? 0) === 0 && Number(value.discountAmount ?? 0) === 0 && Number(value.discountPercent ?? 0) === 0;

async function main() {
  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (manager) => {
      const products = await manager.getRepository(Product).find({
        where: {}, relations: ["deal", "variants"], withDeleted: false,
      });

      for (const product of products) {
        const deal = product.deal?.status === DealStatus.ENABLED ? product.deal : null;
        const updateProduct = async (entity: Product | Variant, isVariant: boolean) => {
          const entityBase = Number(entity.basePrice ?? 0);
          if (deal && entityBase > 0) {
            const snapshot = calculatePriceSnapshot({ basePrice: entityBase, discount: deal.discountPercentage, discountType: DiscountType.PERCENTAGE });
            Object.assign(entity, { discount: 0, discountAmount: 0, discountPercent: 0, discountType: DiscountType.NONE, finalPrice: snapshot.finalPrice });
            counts.deals++;
          } else if (hasLegacyDiscount(entity)) {
            const normalized = normalizeLegacyPricingRecord(entity);
            if (!normalized) { counts.skipped++; skipped.push({ entity: isVariant ? "variant" : "product", id: entity.id, reason: "invalid legacy discount" }); return; }
            Object.assign(entity, normalized);
            counts.legacy++;
          } else if (hasUnclassifiedReduction(entity)) {
            const normalized = normalizeUnlinkedPercentageReduction(entity);
            if (!normalized) {
              counts.skipped++;
              skipped.push({ entity: isVariant ? "variant" : "product", id: entity.id, reason: "reduced finalPrice cannot be exactly reconstructed" });
              return;
            }
            Object.assign(entity, normalized);
            counts.legacy++;
          } else return;

          if (isVariant) {
            if (apply) await manager.getRepository(Variant).save(entity as Variant);
            counts.variants++;
          } else {
            if (apply) await manager.getRepository(Product).save(entity as Product);
            counts.products++;
          }
        };

        // Variant products price through variants. Parent price can be null
        // or stale legacy data and must not be classified independently.
        if (!product.hasVariants) await updateProduct(product, false);
        for (const variant of product.variants ?? []) await updateProduct(variant, true);
      }

      if (!apply) throw new Error("DRY_RUN_ROLLBACK");
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "DRY_RUN_ROLLBACK") throw error;
  } finally {
    await AppDataSource.destroy();
  }
  console.table({ mode: apply ? "APPLY" : "DRY-RUN", ...counts });
  if (skipped.length) console.table(skipped);
  if (!apply) console.log("Dry-run rolled back. Run again with --apply only after reviewing counts.");
}

main().catch((error) => { console.error("Legacy pricing backfill failed:", error); process.exitCode = 1; });
