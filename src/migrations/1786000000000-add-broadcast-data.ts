import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBroadcastData1786000000000 implements MigrationInterface {
  name = "AddBroadcastData1786000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    // Kept as a compatibility marker for environments that already recorded
    // this migration before the optional JSON field was removed.
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // No-op. Data-column removal is handled by 1786100000000.
  }
}
