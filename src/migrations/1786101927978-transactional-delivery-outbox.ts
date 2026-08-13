import { MigrationInterface, QueryRunner } from "typeorm";

export class TransactionalDeliveryOutbox1786101927978 implements MigrationInterface {
  name = "TransactionalDeliveryOutbox1786101927978";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "transactional_deliveries_channel_enum" AS ENUM ('IN_APP', 'PUSH', 'EMAIL')`);
    await queryRunner.query(`CREATE TYPE "transactional_deliveries_recipient_type_enum" AS ENUM ('USER', 'VENDOR', 'ADMIN')`);
    await queryRunner.query(`CREATE TYPE "transactional_deliveries_status_enum" AS ENUM ('PENDING', 'PROCESSING', 'RETRYING', 'SENT', 'SKIPPED', 'FAILED')`);
    await queryRunner.query(`
      CREATE TABLE "transactional_deliveries" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "idempotencyKey" character varying(255) NOT NULL,
        "eventType" character varying(100) NOT NULL,
        "channel" "transactional_deliveries_channel_enum" NOT NULL,
        "recipientType" "transactional_deliveries_recipient_type_enum" NOT NULL,
        "recipientId" integer NOT NULL,
        "recipientEmail" character varying(320),
        "title" character varying(255) NOT NULL,
        "body" text NOT NULL,
        "data" jsonb,
        "status" "transactional_deliveries_status_enum" NOT NULL DEFAULT 'PENDING',
        "attemptCount" integer NOT NULL DEFAULT 0,
        "nextAttemptAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "sentAt" TIMESTAMP WITH TIME ZONE,
        "providerReceipt" text,
        "lastError" text,
        "retriedBy" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transactional_deliveries" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transactional_deliveries_idempotency" UNIQUE ("idempotencyKey")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_transactional_deliveries_status_next" ON "transactional_deliveries" ("status", "nextAttemptAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_transactional_deliveries_recipient_created" ON "transactional_deliveries" ("recipientType", "recipientId", "createdAt")`);
    await queryRunner.query(`
      INSERT INTO "device_tokens" ("userId", "fcmToken", "deviceId", "platform", "isActive", "lastSeenAt")
      SELECT u.id, u."fcmToken", 'legacy-user-' || u.id, 'android', true, now()
      FROM "user" u
      WHERE COALESCE(u."fcmToken", '') <> ''
        AND NOT EXISTS (SELECT 1 FROM "device_tokens" dt WHERE dt."fcmToken" = u."fcmToken")
      ON CONFLICT ("fcmToken") DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "device_tokens" ("vendorId", "fcmToken", "deviceId", "platform", "isActive", "lastSeenAt")
      SELECT v.id, v."fcmToken", 'legacy-vendor-' || v.id, 'android', true, now()
      FROM "vendor" v
      WHERE COALESCE(v."fcmToken", '') <> ''
        AND NOT EXISTS (SELECT 1 FROM "device_tokens" dt WHERE dt."fcmToken" = v."fcmToken")
      ON CONFLICT ("fcmToken") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "transactional_deliveries"`);
    await queryRunner.query(`DROP TYPE "transactional_deliveries_status_enum"`);
    await queryRunner.query(`DROP TYPE "transactional_deliveries_recipient_type_enum"`);
    await queryRunner.query(`DROP TYPE "transactional_deliveries_channel_enum"`);
  }
}
