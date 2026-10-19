import { MigrationInterface, QueryRunner } from "typeorm";

export class PrecisionChange1784829181593 implements MigrationInterface {
    name = 'PrecisionChange1784829181593'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Idempotent by design: dev and prod had diverged (prod had already
        // partially applied an equivalent change under a deleted migration
        // file), so every step here checks the actual current state first
        // instead of assuming a specific starting point. Safe to re-run.

        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" DROP CONSTRAINT IF EXISTS "CHK_order_vendor_shippings_zone"`);

        // --- shippingZone: varchar -> dedicated enum ---
        await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_vendor_shippings_shippingzone_enum') THEN
                    CREATE TYPE "public"."order_vendor_shippings_shippingzone_enum" AS ENUM('SAME_DISTRICT', 'CROSS_DISTRICT');
                END IF;
            END $$;
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                IF (SELECT udt_name FROM information_schema.columns WHERE table_name = 'order_vendor_shippings' AND column_name = 'shippingZone') <> 'order_vendor_shippings_shippingzone_enum' THEN
                    ALTER TABLE "order_vendor_shippings" ALTER COLUMN "shippingZone" TYPE "public"."order_vendor_shippings_shippingzone_enum" USING "shippingZone"::text::"public"."order_vendor_shippings_shippingzone_enum";
                END IF;
            END $$;
        `);

        // --- Discount precision fix (safe to re-run at the same precision) ---
        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "discount" TYPE numeric(8,2)`);

        // --- order_vendor_shippings.status -> its own dedicated enum, cast
        // directly from whatever type it's currently on (no rename-dance,
        // so nothing needs exclusive ownership of the shared type). ---
        await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_vendor_shippings_status_enum') THEN
                    CREATE TYPE "public"."order_vendor_shippings_status_enum" AS ENUM('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');
                END IF;
            END $$;
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                IF (SELECT udt_name FROM information_schema.columns WHERE table_name = 'order_vendor_shippings' AND column_name = 'status') <> 'order_vendor_shippings_status_enum' THEN
                    ALTER TABLE "order_vendor_shippings" ALTER COLUMN "status" DROP DEFAULT;
                    ALTER TABLE "order_vendor_shippings" ALTER COLUMN "status" TYPE "public"."order_vendor_shippings_status_enum" USING "status"::text::"public"."order_vendor_shippings_status_enum";
                    ALTER TABLE "order_vendor_shippings" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';
                END IF;
            END $$;
        `);

        // --- order_status_histories.previousStatus -> its own dedicated enum ---
        await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status_histories_previousstatus_enum') THEN
                    CREATE TYPE "public"."order_status_histories_previousstatus_enum" AS ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'DELAYED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED');
                END IF;
            END $$;
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                IF (SELECT udt_name FROM information_schema.columns WHERE table_name = 'order_status_histories' AND column_name = 'previousStatus') <> 'order_status_histories_previousstatus_enum' THEN
                    ALTER TABLE "order_status_histories" ALTER COLUMN "previousStatus" TYPE "public"."order_status_histories_previousstatus_enum" USING "previousStatus"::text::"public"."order_status_histories_previousstatus_enum";
                END IF;
            END $$;
        `);

        // --- order_status_histories.newStatus -> its own dedicated enum ---
        await queryRunner.query(`
            DO $$ BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status_histories_newstatus_enum') THEN
                    CREATE TYPE "public"."order_status_histories_newstatus_enum" AS ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'DELAYED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED');
                END IF;
            END $$;
        `);
        await queryRunner.query(`
            DO $$ BEGIN
                IF (SELECT udt_name FROM information_schema.columns WHERE table_name = 'order_status_histories' AND column_name = 'newStatus') <> 'order_status_histories_newstatus_enum' THEN
                    ALTER TABLE "order_status_histories" ALTER COLUMN "newStatus" TYPE "public"."order_status_histories_newstatus_enum" USING "newStatus"::text::"public"."order_status_histories_newstatus_enum";
                END IF;
            END $$;
        `);

        // orders.status is intentionally left untouched — it keeps using
        // the original shared "orders_status_enum" type/name; nothing above
        // renames or drops it.
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DO $$ BEGIN
                IF (SELECT udt_name FROM information_schema.columns WHERE table_name = 'order_status_histories' AND column_name = 'newStatus') = 'order_status_histories_newstatus_enum' THEN
                    ALTER TABLE "order_status_histories" ALTER COLUMN "newStatus" TYPE "public"."orders_status_enum" USING "newStatus"::text::"public"."orders_status_enum";
                END IF;
            END $$;
        `);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."order_status_histories_newstatus_enum"`);

        await queryRunner.query(`
            DO $$ BEGIN
                IF (SELECT udt_name FROM information_schema.columns WHERE table_name = 'order_status_histories' AND column_name = 'previousStatus') = 'order_status_histories_previousstatus_enum' THEN
                    ALTER TABLE "order_status_histories" ALTER COLUMN "previousStatus" TYPE "public"."orders_status_enum" USING "previousStatus"::text::"public"."orders_status_enum";
                END IF;
            END $$;
        `);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."order_status_histories_previousstatus_enum"`);

        await queryRunner.query(`
            DO $$ BEGIN
                IF (SELECT udt_name FROM information_schema.columns WHERE table_name = 'order_vendor_shippings' AND column_name = 'status') = 'order_vendor_shippings_status_enum' THEN
                    ALTER TABLE "order_vendor_shippings" ALTER COLUMN "status" DROP DEFAULT;
                    ALTER TABLE "order_vendor_shippings" ALTER COLUMN "status" TYPE "public"."orders_status_enum" USING "status"::text::"public"."orders_status_enum";
                    ALTER TABLE "order_vendor_shippings" ALTER COLUMN "status" SET DEFAULT 'CONFIRMED';
                END IF;
            END $$;
        `);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."order_vendor_shippings_status_enum"`);

        await queryRunner.query(`ALTER TABLE "products" ALTER COLUMN "discount" TYPE numeric(5,2)`);

        await queryRunner.query(`
            DO $$ BEGIN
                IF (SELECT udt_name FROM information_schema.columns WHERE table_name = 'order_vendor_shippings' AND column_name = 'shippingZone') = 'order_vendor_shippings_shippingzone_enum' THEN
                    ALTER TABLE "order_vendor_shippings" ALTER COLUMN "shippingZone" TYPE character varying USING "shippingZone"::text;
                END IF;
            END $$;
        `);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."order_vendor_shippings_shippingzone_enum"`);
        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" ADD CONSTRAINT "CHK_order_vendor_shippings_zone" CHECK ((("shippingZone")::text = ANY ((ARRAY['SAME_DISTRICT'::character varying, 'CROSS_DISTRICT'::character varying])::text[])))`);
    }

}
