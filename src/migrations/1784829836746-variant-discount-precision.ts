import { MigrationInterface, QueryRunner } from "typeorm";

export class VariantDiscountPrecision1784829836746
  implements MigrationInterface
{
  name = "VariantDiscountPrecision1784829836746";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "variants" ALTER COLUMN "discount" TYPE numeric(8,2)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "variants" ALTER COLUMN "discount" TYPE numeric(5,2)`,
    );
  }
}
