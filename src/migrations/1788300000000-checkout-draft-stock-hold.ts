import { MigrationInterface, QueryRunner } from "typeorm";

/** Whether a pending online checkout currently holds its items' stock. */
export class CheckoutDraftStockHold1788300000000 implements MigrationInterface {
    name = "CheckoutDraftStockHold1788300000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TABLE "checkout_drafts" ADD COLUMN IF NOT EXISTS "stockHeld" boolean NOT NULL DEFAULT false`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "checkout_drafts" DROP COLUMN IF EXISTS "stockHeld"`);
    }
}
