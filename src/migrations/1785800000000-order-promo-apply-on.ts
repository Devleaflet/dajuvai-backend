import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderPromoApplyOn1785800000000 implements MigrationInterface {
    name = "OrderPromoApplyOn1785800000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" ADD "promoApplyOn" character varying`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "promoApplyOn"`);
    }
}
