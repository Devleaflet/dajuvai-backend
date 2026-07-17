import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateFcmTables1775385055807 implements MigrationInterface {
    name = "CreateFcmTables1775385055807";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // TypeORM's @PrimaryGeneratedColumn("uuid") compiles to a uuid_generate_v4()
        // default, which lives in uuid-ossp. Earlier tables got this extension
        // implicitly via synchronize; raw SQL has to ask for it.
        await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

        // notifications.title was varchar(20) — "Order Status Updated" is exactly
        // 20 chars, so any admin-authored title overflowed and threw at insert.
        await queryRunner.query(
            `ALTER TABLE "notifications" ALTER COLUMN "title" TYPE character varying(255)`,
        );

        // ── device_tokens ────────────────────────────────────────────────────
        await queryRunner.query(
            `CREATE TYPE "public"."device_tokens_platform_enum" AS ENUM('android', 'ios', 'web')`,
        );
        await queryRunner.query(`
            CREATE TABLE "device_tokens" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" integer,
                "vendorId" integer,
                "fcmToken" text NOT NULL,
                "platform" "public"."device_tokens_platform_enum" NOT NULL,
                "deviceId" character varying(255) NOT NULL,
                "appVersion" character varying(20),
                "deviceModel" character varying(100),
                "osVersion" character varying(50),
                "isActive" boolean NOT NULL DEFAULT true,
                "lastSeenAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_device_tokens" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_device_tokens_fcm_token" UNIQUE ("fcmToken"),
                CONSTRAINT "CHK_device_tokens_one_owner" CHECK (
                    ("userId" IS NOT NULL AND "vendorId" IS NULL)
                    OR ("userId" IS NULL AND "vendorId" IS NOT NULL)
                )
            )
        `);
        await queryRunner.query(
            `ALTER TABLE "device_tokens" ADD CONSTRAINT "FK_device_tokens_user"
             FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE`,
        );
        await queryRunner.query(
            `ALTER TABLE "device_tokens" ADD CONSTRAINT "FK_device_tokens_vendor"
             FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE CASCADE`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_device_tokens_user_active" ON "device_tokens" ("userId", "isActive")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_device_tokens_vendor_active" ON "device_tokens" ("vendorId", "isActive")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_device_tokens_user_device" ON "device_tokens" ("userId", "deviceId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_device_tokens_vendor_device" ON "device_tokens" ("vendorId", "deviceId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_device_tokens_is_active" ON "device_tokens" ("isActive")`,
        );

        // ── notification_dispatches ──────────────────────────────────────────
        await queryRunner.query(
            `CREATE TYPE "public"."notification_dispatches_type_enum" AS ENUM('single', 'multicast', 'topic')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."notification_dispatches_priority_enum" AS ENUM('high', 'normal')`,
        );
        await queryRunner.query(
            `CREATE TYPE "public"."notification_dispatches_status_enum" AS ENUM('pending', 'sent', 'partial', 'failed')`,
        );
        await queryRunner.query(`
            CREATE TABLE "notification_dispatches" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "type" "public"."notification_dispatches_type_enum" NOT NULL,
                "title" character varying(255) NOT NULL,
                "body" text NOT NULL,
                "imageUrl" character varying(500),
                "data" jsonb,
                "targetUserId" integer,
                "targetVendorId" integer,
                "targetUserIds" jsonb,
                "targetTopic" character varying(100),
                "priority" "public"."notification_dispatches_priority_enum" NOT NULL DEFAULT 'high',
                "status" "public"."notification_dispatches_status_enum" NOT NULL DEFAULT 'pending',
                "successCount" integer NOT NULL DEFAULT 0,
                "failureCount" integer NOT NULL DEFAULT 0,
                "totalTargets" integer NOT NULL DEFAULT 0,
                "firebaseMessageIds" jsonb,
                "errorDetails" text,
                "sentBy" integer NOT NULL,
                "sentAt" TIMESTAMP WITH TIME ZONE,
                "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
                CONSTRAINT "PK_notification_dispatches" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(
            `CREATE INDEX "IDX_notification_dispatches_status" ON "notification_dispatches" ("status")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_notification_dispatches_type" ON "notification_dispatches" ("type")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_notification_dispatches_target_user" ON "notification_dispatches" ("targetUserId")`,
        );
        await queryRunner.query(
            `CREATE INDEX "IDX_notification_dispatches_sent_by" ON "notification_dispatches" ("sentBy")`,
        );
        // History is always ordered newest-first, so index the sort direction.
        await queryRunner.query(
            `CREATE INDEX "IDX_notification_dispatches_created_at" ON "notification_dispatches" ("createdAt" DESC)`,
        );

        // ── Backfill legacy single-column tokens ─────────────────────────────
        // Carries existing installs over so nobody silently loses push on deploy.
        // DISTINCT ON keeps one row per token — the unique constraint would
        // otherwise reject a token shared across accounts.
        await queryRunner.query(`
            INSERT INTO "device_tokens" ("userId", "fcmToken", "deviceId", "platform", "isActive", "lastSeenAt")
            SELECT DISTINCT ON ("fcmToken") id, "fcmToken", 'legacy-user-' || id, 'android', true, now()
            FROM "user"
            WHERE "fcmToken" IS NOT NULL AND "fcmToken" <> ''
            ON CONFLICT ("fcmToken") DO NOTHING
        `);
        await queryRunner.query(`
            INSERT INTO "device_tokens" ("vendorId", "fcmToken", "deviceId", "platform", "isActive", "lastSeenAt")
            SELECT DISTINCT ON ("fcmToken") id, "fcmToken", 'legacy-vendor-' || id, 'android', true, now()
            FROM "vendor"
            WHERE "fcmToken" IS NOT NULL AND "fcmToken" <> ''
            ON CONFLICT ("fcmToken") DO NOTHING
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "notification_dispatches"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."notification_dispatches_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."notification_dispatches_priority_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."notification_dispatches_type_enum"`);

        await queryRunner.query(`DROP TABLE IF EXISTS "device_tokens"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."device_tokens_platform_enum"`);

        // Not reverting notifications.title to varchar(20) — narrowing it would
        // truncate or fail on rows written since this migration ran.
    }
}
