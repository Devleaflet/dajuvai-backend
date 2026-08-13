import { MigrationInterface, QueryRunner } from "typeorm";

export class NormalizeAuditActors1786101927982 implements MigrationInterface {
  name = "NormalizeAuditActors1786101927982";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "public"."staff_permissions_module_enum" ADD VALUE IF NOT EXISTS 'audit'`);
    // Remove denormalized labels from the earlier rollout. actorId/type remain authoritative.
    await queryRunner.query(`UPDATE "audit_logs" SET "actorLabel" = NULL WHERE "actorLabel" IS NOT NULL`);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL enum values cannot be safely removed. Labels intentionally stay normalized.
  }
}
