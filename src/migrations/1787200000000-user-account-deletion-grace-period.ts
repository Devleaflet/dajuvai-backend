import { MigrationInterface, QueryRunner } from "typeorm";

export class UserAccountDeletionGracePeriod1787200000000
  implements MigrationInterface
{
  name = "UserAccountDeletionGracePeriod1787200000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" ADD "deletionRequestedAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "user" ADD "deletionScheduledFor" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "user" ADD "deletionFinalizedAt" TIMESTAMP`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "deletionFinalizedAt"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "deletionScheduledFor"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "deletionRequestedAt"`);
  }
}
