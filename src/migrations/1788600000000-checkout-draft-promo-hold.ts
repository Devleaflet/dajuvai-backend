import { MigrationInterface, QueryRunner } from "typeorm";

/** Whether a pending online checkout currently holds one use of its promo code. */
export class CheckoutDraftPromoHold1788600000000 implements MigrationInterface {
    name = "CheckoutDraftPromoHold1788600000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "promoHeld" boolean NOT NULL DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "checkout_drafts" DROP COLUMN IF EXISTS "promoHeld"`);
    }
}
