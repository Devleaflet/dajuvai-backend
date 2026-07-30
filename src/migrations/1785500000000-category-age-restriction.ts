import { MigrationInterface, QueryRunner } from "typeorm";

export class CategoryAgeRestriction1785500000000 implements MigrationInterface {
    name = "CategoryAgeRestriction1785500000000";
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "category" ADD "isAgeRestricted" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "category" ADD "minimumAge" integer`);
        await queryRunner.query(`ALTER TABLE "category" ADD "restrictionMessage" character varying`);
        await queryRunner.query(`CREATE INDEX "IDX_category_age_restricted" ON "category" ("isAgeRestricted")`);
    }
    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_category_age_restricted"`);
        await queryRunner.query(`ALTER TABLE "category" DROP COLUMN "restrictionMessage"`);
        await queryRunner.query(`ALTER TABLE "category" DROP COLUMN "minimumAge"`);
        await queryRunner.query(`ALTER TABLE "category" DROP COLUMN "isAgeRestricted"`);
    }
}
