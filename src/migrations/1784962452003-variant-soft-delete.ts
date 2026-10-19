import { MigrationInterface, QueryRunner } from "typeorm";

export class VariantSoftDelete1784962452003 implements MigrationInterface {
  name = "VariantSoftDelete1784962452003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "variants" ADD "deleted_at" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "variants" DROP COLUMN "deleted_at"`);
  }
}
