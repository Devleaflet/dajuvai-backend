import { MigrationInterface, QueryRunner } from "typeorm";

export class VendorAccountDeletionGracePeriod1786101927976
  implements MigrationInterface
{
  name = "VendorAccountDeletionGracePeriod1786101927976";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "vendor" ADD "deletionRequestedAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "vendor" ADD "deletionScheduledFor" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "vendor" ADD "deletionFinalizedAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "vendor" ADD "deletionPreviousApproval" boolean`);
    await queryRunner.query(`ALTER TABLE "products" ADD "vendorDeletionArchivedAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "variants" ADD "vendorDeletionArchivedAt" TIMESTAMP`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "variants" DROP COLUMN "vendorDeletionArchivedAt"`);
    await queryRunner.query(`ALTER TABLE "products" DROP COLUMN "vendorDeletionArchivedAt"`);
    await queryRunner.query(`ALTER TABLE "vendor" DROP COLUMN "deletionPreviousApproval"`);
    await queryRunner.query(`ALTER TABLE "vendor" DROP COLUMN "deletionFinalizedAt"`);
    await queryRunner.query(`ALTER TABLE "vendor" DROP COLUMN "deletionScheduledFor"`);
    await queryRunner.query(`ALTER TABLE "vendor" DROP COLUMN "deletionRequestedAt"`);
  }
}
