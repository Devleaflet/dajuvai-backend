import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBroadcastSystem1785900000000 implements MigrationInterface {
  name = "CreateBroadcastSystem1785900000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`DO $$ BEGIN CREATE TYPE "public"."broadcasts_status_enum" AS ENUM('DRAFT','QUEUED','PROCESSING','COMPLETED','PARTIALLY_COMPLETED','FAILED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`DO $$ BEGIN CREATE TYPE "public"."broadcasts_audienceType_enum" AS ENUM('ALL_USERS','ALL_VENDORS','ALL_USERS_AND_VENDORS','SELECTED_USERS','SELECTED_VENDORS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`DO $$ BEGIN CREATE TYPE "public"."broadcast_contents_channel_enum" AS ENUM('FCM','EMAIL','IN_APP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`DO $$ BEGIN CREATE TYPE "public"."broadcast_recipients_recipientType_enum" AS ENUM('USER','VENDOR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`DO $$ BEGIN CREATE TYPE "public"."broadcast_recipients_status_enum" AS ENUM('PENDING','PROCESSING','COMPLETED','PARTIALLY_COMPLETED','FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`DO $$ BEGIN CREATE TYPE "public"."broadcast_deliveries_channel_enum" AS ENUM('FCM','EMAIL','IN_APP'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
    await queryRunner.query(`DO $$ BEGIN CREATE TYPE "public"."broadcast_deliveries_status_enum" AS ENUM('PENDING','PROCESSING','SENT','FAILED','SKIPPED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);

    await queryRunner.query(`
      CREATE TABLE "broadcasts" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" varchar(200) NOT NULL,
        "status" "public"."broadcasts_status_enum" NOT NULL DEFAULT 'DRAFT',
        "audienceType" "public"."broadcasts_audienceType_enum" NOT NULL,
        "channels" jsonb NOT NULL,
        "selectedUserIds" jsonb,
        "selectedVendorIds" jsonb,
        "createdById" integer NOT NULL,
        "scheduledAt" timestamptz,
        "startedAt" timestamptz,
        "completedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_broadcasts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_broadcasts_created_by" ON "broadcasts" ("createdById")`);
    await queryRunner.query(`CREATE INDEX "IDX_broadcasts_status_created" ON "broadcasts" ("status", "createdAt")`);
    await queryRunner.query(`ALTER TABLE "broadcasts" ADD CONSTRAINT "FK_broadcasts_created_by" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE RESTRICT`);

    await queryRunner.query(`
      CREATE TABLE "broadcast_contents" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "broadcastId" uuid NOT NULL,
        "channel" "public"."broadcast_contents_channel_enum" NOT NULL,
        "title" varchar(200),
        "subject" varchar(200),
        "body" text NOT NULL,
        "htmlContent" text,
        "imageUrl" varchar(500),
        "actionType" varchar(50),
        "actionValue" varchar(255),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_broadcast_contents" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_broadcast_contents_broadcast_channel" UNIQUE ("broadcastId", "channel")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_broadcast_contents_broadcast" ON "broadcast_contents" ("broadcastId")`);
    await queryRunner.query(`ALTER TABLE "broadcast_contents" ADD CONSTRAINT "FK_broadcast_contents_broadcast" FOREIGN KEY ("broadcastId") REFERENCES "broadcasts"("id") ON DELETE CASCADE`);

    await queryRunner.query(`
      CREATE TABLE "broadcast_recipients" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "broadcastId" uuid NOT NULL,
        "recipientType" "public"."broadcast_recipients_recipientType_enum" NOT NULL,
        "userId" integer,
        "vendorId" integer,
        "email" varchar(255),
        "status" "public"."broadcast_recipients_status_enum" NOT NULL DEFAULT 'PENDING',
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_broadcast_recipients" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_broadcast_recipients_broadcast" ON "broadcast_recipients" ("broadcastId")`);
    await queryRunner.query(`CREATE INDEX "IDX_broadcast_recipients_broadcast_status" ON "broadcast_recipients" ("broadcastId", "status")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_broadcast_recipients_user" ON "broadcast_recipients" ("broadcastId", "userId") WHERE "userId" IS NOT NULL`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_broadcast_recipients_vendor" ON "broadcast_recipients" ("broadcastId", "vendorId") WHERE "vendorId" IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "FK_broadcast_recipients_broadcast" FOREIGN KEY ("broadcastId") REFERENCES "broadcasts"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "FK_broadcast_recipients_user" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "broadcast_recipients" ADD CONSTRAINT "FK_broadcast_recipients_vendor" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE CASCADE`);

    await queryRunner.query(`
      CREATE TABLE "broadcast_deliveries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "broadcastRecipientId" uuid NOT NULL,
        "channel" "public"."broadcast_deliveries_channel_enum" NOT NULL,
        "status" "public"."broadcast_deliveries_status_enum" NOT NULL DEFAULT 'PENDING',
        "attemptCount" integer NOT NULL DEFAULT 0,
        "errorMessage" text,
        "sentAt" timestamptz,
        "failedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_broadcast_deliveries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_broadcast_deliveries_recipient_channel" UNIQUE ("broadcastRecipientId", "channel")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_broadcast_deliveries_recipient" ON "broadcast_deliveries" ("broadcastRecipientId")`);
    await queryRunner.query(`CREATE INDEX "IDX_broadcast_deliveries_status" ON "broadcast_deliveries" ("status")`);
    await queryRunner.query(`ALTER TABLE "broadcast_deliveries" ADD CONSTRAINT "FK_broadcast_deliveries_recipient" FOREIGN KEY ("broadcastRecipientId") REFERENCES "broadcast_recipients"("id") ON DELETE CASCADE`);

    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "imageUrl" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "actionType" varchar(50)`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "actionValue" varchar(255)`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "broadcastId" uuid`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "readAt" timestamptz`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_notifications_broadcast" ON "notifications" ("broadcastId")`);
    await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_broadcast" FOREIGN KEY ("broadcastId") REFERENCES "broadcasts"("id") ON DELETE SET NULL`);
    await queryRunner.query(`ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "marketingEmailsEnabled" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "vendor" ADD COLUMN IF NOT EXISTS "marketingEmailsEnabled" boolean NOT NULL DEFAULT true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "FK_notifications_broadcast"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_notifications_broadcast"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "readAt"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "broadcastId"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "actionValue"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "actionType"`);
    await queryRunner.query(`ALTER TABLE "notifications" DROP COLUMN IF EXISTS "imageUrl"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN IF EXISTS "marketingEmailsEnabled"`);
    await queryRunner.query(`ALTER TABLE "vendor" DROP COLUMN IF EXISTS "marketingEmailsEnabled"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "broadcast_deliveries"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "broadcast_recipients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "broadcast_contents"`);
    await queryRunner.query(`ALTER TABLE "broadcasts" DROP CONSTRAINT IF EXISTS "FK_broadcasts_created_by"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "broadcasts"`);
    for (const type of ["broadcast_deliveries_status_enum", "broadcast_deliveries_channel_enum", "broadcast_recipients_status_enum", "broadcast_recipients_recipientType_enum", "broadcast_contents_channel_enum", "broadcasts_audienceType_enum", "broadcasts_status_enum"]) {
      await queryRunner.query(`DROP TYPE IF EXISTS "public"."${type}"`);
    }
  }
}
