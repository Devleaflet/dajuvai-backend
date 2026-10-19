import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderItemPriceBreakdown1785200100000
    implements MigrationInterface
{
    name = "OrderItemPriceBreakdown1785200100000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "order_items"
            ADD COLUMN IF NOT EXISTS "basePriceSnapshot" numeric(8,2),
            ADD COLUMN IF NOT EXISTS "productDiscountSnapshot" numeric(8,2) NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "dealDiscountSnapshot" numeric(8,2) NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS "discountTypeSnapshot" character varying,
            ADD COLUMN IF NOT EXISTS "discountLabelSnapshot" character varying,
            ADD COLUMN IF NOT EXISTS "dealNameSnapshot" character varying,
            ADD COLUMN IF NOT EXISTS "dealPercentSnapshot" numeric(5,2)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "order_items"
            DROP COLUMN IF EXISTS "dealPercentSnapshot",
            DROP COLUMN IF EXISTS "dealNameSnapshot",
            DROP COLUMN IF EXISTS "discountLabelSnapshot",
            DROP COLUMN IF EXISTS "discountTypeSnapshot",
            DROP COLUMN IF EXISTS "dealDiscountSnapshot",
            DROP COLUMN IF EXISTS "productDiscountSnapshot",
            DROP COLUMN IF EXISTS "basePriceSnapshot"
        `);
    }
}
