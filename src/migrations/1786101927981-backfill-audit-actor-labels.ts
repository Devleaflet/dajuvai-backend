import { MigrationInterface, QueryRunner } from "typeorm";

export class BackfillAuditActorLabels1786101927981 implements MigrationInterface {
  name = "BackfillAuditActorLabels1786101927981";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "audit_logs" audit
      SET "actorLabel" = LEFT(CONCAT(
        COALESCE(NULLIF(u."fullName", ''), NULLIF(u."username", ''), u."email", INITCAP(LOWER(audit."actorType"::text))),
        ' (', audit."actorType", ')'
      ), 160)
      FROM "user" u
      WHERE audit."actorId" = u."id"
        AND audit."actorType" IN ('ADMIN', 'STAFF', 'USER', 'RIDER')
    `);
    await queryRunner.query(`
      UPDATE "audit_logs" audit
      SET "actorLabel" = LEFT(CONCAT(
        COALESCE(NULLIF(v."businessName", ''), v."email", 'Vendor'),
        ' (VENDOR)'
      ), 160)
      FROM "vendor" v
      WHERE audit."actorId" = v."id"
        AND audit."actorType" = 'VENDOR'
    `);
    await queryRunner.query(`
      UPDATE "audit_logs"
      SET "actorLabel" = 'System (SYSTEM)'
      WHERE "actorType" = 'SYSTEM' AND ("actorLabel" IS NULL OR "actorLabel" = '')
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Actor labels are historical audit data; do not erase them on rollback.
  }
}
