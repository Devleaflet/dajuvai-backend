import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveBroadcastData1786100000000 implements MigrationInterface {
  name = "RemoveBroadcastData1786100000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "data"`);
    await queryRunner.query(`ALTER TABLE "broadcast_contents" DROP COLUMN IF EXISTS "data"`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "broadcast_contents" ADD COLUMN IF NOT EXISTS "data" jsonb`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "data" jsonb`);
  }
}
