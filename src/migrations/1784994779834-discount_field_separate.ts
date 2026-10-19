import { MigrationInterface, QueryRunner } from "typeorm";

export class DiscountFieldSeparate1784994779834 implements MigrationInterface {
    name = 'DiscountFieldSeparate1784994779834'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "variants" ADD "discountAmount" numeric(8,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "variants" ADD "discountPercent" numeric(5,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "products" ADD "discountAmount" numeric(8,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "products" ADD "discountPercent" numeric(5,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "variants" ALTER COLUMN "discountType" SET DEFAULT 'NONE'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "variants" ALTER COLUMN "discountType" SET DEFAULT 'PERCENTAGE'`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "discountPercent"`);
        await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "discountAmount"`);
        await queryRunner.query(`ALTER TABLE "variants" DROP COLUMN "discountPercent"`);
        await queryRunner.query(`ALTER TABLE "variants" DROP COLUMN "discountAmount"`);
    }

}
