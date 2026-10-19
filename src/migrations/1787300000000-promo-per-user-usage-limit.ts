import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Per-customer promo usage limits.
 *
 * `promo.maxUsagePerUser` caps how many times one customer may use a code, 0
 * meaning unlimited — the same convention `maxUsageCount` already uses, so an
 * existing row keeps behaving exactly as it does today.
 *
 * `promo_redemption` is the ledger that makes the cap enforceable: who used
 * which code on which order. Unique on `orderId` so a retried checkout cannot
 * claim the same code twice for one order, and indexed on (promoId, userId)
 * because counting a customer's uses is the question asked on every checkout.
 */
export class PromoPerUserUsageLimit1787300000000 implements MigrationInterface {
    name = "PromoPerUserUsageLimit1787300000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "promo" ADD COLUMN IF NOT EXISTS "maxUsagePerUser" integer NOT NULL DEFAULT 0`,
        );

        /*
         * Every existing code was one-per-customer: that rule was hard-coded in
         * promoRules.ts rather than stored. Backfilling to 1 keeps codes already
         * in customers' hands behaving exactly as they do today -- leaving them
         * at the 0 default would silently make every one of them unlimited.
         *
         * Only rows that existed before this column did: the DEFAULT above
         * makes anything created afterwards 0, and an admin chooses from there.
         */
        await queryRunner.query(
            `UPDATE "promo" SET "maxUsagePerUser" = 1 WHERE "maxUsagePerUser" = 0`,
        );

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "promo_redemption" (
                "id" SERIAL NOT NULL,
                "promoId" integer NOT NULL,
                "userId" integer NOT NULL,
                "orderId" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_promo_redemption" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_promo_redemption_order" UNIQUE ("orderId")
            )
        `);

        await queryRunner.query(
            `CREATE INDEX IF NOT EXISTS "IDX_promo_redemption_promo_user" ON "promo_redemption" ("promoId", "userId")`,
        );

        await queryRunner.query(`
            ALTER TABLE "promo_redemption"
            ADD CONSTRAINT "FK_promo_redemption_promo"
            FOREIGN KEY ("promoId") REFERENCES "promo"("id") ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE "promo_redemption"
            ADD CONSTRAINT "FK_promo_redemption_user"
            FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE
        `);

        await queryRunner.query(`
            ALTER TABLE "promo_redemption"
            ADD CONSTRAINT "FK_promo_redemption_order"
            FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "promo_redemption"`);
        await queryRunner.query(
            `ALTER TABLE "promo" DROP COLUMN IF EXISTS "maxUsagePerUser"`,
        );
    }
}
