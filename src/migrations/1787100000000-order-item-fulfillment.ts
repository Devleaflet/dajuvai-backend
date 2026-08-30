import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderItemFulfillment1787100000000
    implements MigrationInterface
{
    name = "OrderItemFulfillment1787100000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Independent per-item fulfillment state for multi-vendor partial
        // availability. CREATE TYPE + first usage in the same migration is
        // safe — Postgres only forbids using enum values added via
        // ALTER TYPE ... ADD VALUE inside the transaction that added them,
        // and this migration runs in its own transaction anyway
        // (migrationsTransactionMode: "each").
        await queryRunner.query(`
            CREATE TYPE "public"."order_items_fulfillmentstatus_enum"
                AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED')
        `);
        await queryRunner.query(`
            ALTER TABLE "order_items"
            ADD COLUMN IF NOT EXISTS "fulfillmentStatus" "public"."order_items_fulfillmentstatus_enum" NOT NULL DEFAULT 'PENDING',
            ADD COLUMN IF NOT EXISTS "cancellationRemark" character varying(1000),
            ADD COLUMN IF NOT EXISTS "confirmedAt" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS "cancelledAt" TIMESTAMP WITH TIME ZONE,
            ADD COLUMN IF NOT EXISTS "updatedById" integer
        `);
        await queryRunner.query(`
            ALTER TABLE "order_items"
            ADD CONSTRAINT "FK_order_items_updatedById"
            FOREIGN KEY ("updatedById") REFERENCES "user"("id")
            ON DELETE SET NULL ON UPDATE NO ACTION
        `);

        // ── Backfill from parent order status (spec §13) ─────────────────
        // Orders already in an active/fulfilled state → their items were
        // evidently confirmed. Terminally failed/cancelled orders → items
        // cancelled together with the parent (system remark keeps the
        // "CANCELLED ⇒ remark present" invariant intact). ORDER_PLACED rows
        // keep the DEFAULT 'PENDING' so admin still reviews them.
        await queryRunner.query(`
            UPDATE "order_items" oi
            SET "fulfillmentStatus" = 'CONFIRMED', "confirmedAt" = now()
            FROM "orders" o
            WHERE oi."orderId" = o.id
              AND o.status IN ('CONFIRMED','PROCESSING','ARRIVED_AT_WAREHOUSE','DELAYED','ASSIGNED_TO_RIDER','DELIVERED')
        `);
        await queryRunner.query(`
            UPDATE "order_items" oi
            SET "fulfillmentStatus" = 'CANCELLED',
                "cancelledAt" = now(),
                "cancellationRemark" = 'Cancelled with parent order (legacy backfill)'
            FROM "orders" o
            WHERE oi."orderId" = o.id
              AND o.status IN ('CANCELLED','RETURNED','NOT_RECEIVED')
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "FK_order_items_updatedById"`);
        await queryRunner.query(`
            ALTER TABLE "order_items"
            DROP COLUMN IF EXISTS "updatedById",
            DROP COLUMN IF EXISTS "cancelledAt",
            DROP COLUMN IF EXISTS "confirmedAt",
            DROP COLUMN IF EXISTS "cancellationRemark",
            DROP COLUMN IF EXISTS "fulfillmentStatus"
        `);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."order_items_fulfillmentstatus_enum"`);
    }
}
