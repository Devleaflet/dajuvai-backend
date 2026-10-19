import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateAuditLogs1786101927979 implements MigrationInterface {
  name = "CreateAuditLogs1786101927979";
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "audit_logs_actor_type_enum" AS ENUM ('ADMIN','STAFF','VENDOR','USER','RIDER','SYSTEM')`);
    await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "module" varchar(40) NOT NULL, "action" varchar(80) NOT NULL, "entityType" varchar(80) NOT NULL, "entityId" varchar(100), "actorType" "audit_logs_actor_type_enum" NOT NULL, "actorId" integer, "actorLabel" varchar(160), "summary" text NOT NULL, "before" jsonb, "after" jsonb, "requestId" varchar(100), "ipAddress" varchar(64), "userAgent" varchar(255), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"))`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" ("createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_module_action_created" ON "audit_logs" ("module", "action", "createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_actor_created" ON "audit_logs" ("actorType", "actorId", "createdAt" DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_audit_logs_entity_created" ON "audit_logs" ("entityType", "entityId", "createdAt" DESC)`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TYPE "audit_logs_actor_type_enum"`);
  }
}
