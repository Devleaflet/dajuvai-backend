import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Orders placed before `promoApplyOn` existed have it NULL, so a seller's
 * settlement could not tell a delivery promo from an item promo and charged
 * a SHIPPING promo against the seller's items. Copy the type from the promo
 * itself; codes match case-insensitively, as they do at checkout.
 */
export class BackfillOrderPromoApplyOn1788100000000 implements MigrationInterface {
    name = "BackfillOrderPromoApplyOn1788100000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "orders" o
               SET "promoApplyOn" = p."applyOn"::text
              FROM "promo" p
             WHERE o."promoApplyOn" IS NULL
               AND o."appliedPromoCode" IS NOT NULL
               AND upper(trim(p."promoCode")) = upper(trim(o."appliedPromoCode"))
        `);
    }

    public async down(): Promise<void> {
        // Not reversible: which rows were NULL before is not recorded, and the
        // backfilled value is what the order should always have carried.
    }
}
