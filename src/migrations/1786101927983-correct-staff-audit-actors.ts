import { MigrationInterface, QueryRunner } from "typeorm";

export class CorrectStaffAuditActors1786101927983 implements MigrationInterface {
  name = "CorrectStaffAuditActors1786101927983";

  async up(queryRunner: QueryRunner): Promise<void> {
    // Earlier order-status writes used ADMIN as their shared operational role.
    // Restore actual staff actors from their source account.
    await queryRunner.query(`
      UPDATE "audit_logs" audit
      SET "actorType" = 'STAFF'
      FROM "user" actor
      WHERE audit."actorId" = actor."id"
        AND audit."actorType" = 'ADMIN'
        AND actor."role" = 'staff'
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op. Reverting must not relabel audit history incorrectly.
  }
}
