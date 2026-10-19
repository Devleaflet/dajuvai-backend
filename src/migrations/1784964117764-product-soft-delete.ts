import { MigrationInterface, QueryRunner } from "typeorm";

export class ProductSoftDelete1784964117764 implements MigrationInterface {
  name = "ProductSoftDelete1784964117764";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "products" ADD "deleted_at" TIMESTAMP`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "deleted_at"`);
  }
}
