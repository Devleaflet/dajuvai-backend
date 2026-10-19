import { MigrationInterface, QueryRunner } from "typeorm";

export class PromoUsageLimits1785600000000 implements MigrationInterface {
    name = "PromoUsageLimits1785600000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "promo" ADD "maxUsageCount" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "promo" ADD "usageCount" integer NOT NULL DEFAULT '0'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "promo" DROP COLUMN "usageCount"`);
        await queryRunner.query(`ALTER TABLE "promo" DROP COLUMN "maxUsageCount"`);
    }
}
