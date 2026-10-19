import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotificationFeedIndexes1786101927980 implements MigrationInterface {
  name = "AddNotificationFeedIndexes1786101927980";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE INDEX "IDX_notifications_admin_feed" ON "notifications" ("target", "isRead", "createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_vendor_feed" ON "notifications" ("target", "vendorId", "isRead", "createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_user_feed" ON "notifications" ("target", "createdById", "isRead", "createdAt" DESC)`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_notifications_user_feed"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_vendor_feed"`);
    await queryRunner.query(`DROP INDEX "IDX_notifications_admin_feed"`);
  }
}
