import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderStatusProcessingAndHistory1784455956678 implements MigrationInterface {
    name = 'OrderStatusProcessingAndHistory1784455956678'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // New real lifecycle state between CONFIRMED and SHIPPED. The
        // frontend already offered "Processing" as an option before this
        // migration; the DB enum just never actually had it, which is why
        // PUT /api/order/admin/:id/status with { status: "PROCESSING" }
        // failed validation.
        await queryRunner.query(`ALTER TYPE "public"."orders_status_enum" ADD VALUE IF NOT EXISTS 'PROCESSING'`);

        await queryRunner.query(`
            CREATE TYPE "public"."order_status_histories_changedbyrole_enum" AS ENUM('ADMIN', 'VENDOR', 'SYSTEM', 'CUSTOMER')
        `);
        await queryRunner.query(`
            CREATE TABLE "order_status_histories" (
                "id" SERIAL NOT NULL,
                "orderId" integer NOT NULL,
                "vendorOrderId" integer,
                "previousStatus" "public"."orders_status_enum",
                "newStatus" "public"."orders_status_enum" NOT NULL,
                "changedByUserId" integer,
                "changedByRole" "public"."order_status_histories_changedbyrole_enum" NOT NULL,
                "reason" character varying,
                "note" character varying,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_order_status_histories" PRIMARY KEY ("id")
            )
        `);

        // Per-vendor fulfillment stage — distinct from the parent order's
        // overall status. Reuses orders_status_enum since VendorOrderStatus's
        // values (CONFIRMED/PROCESSING/SHIPPED/DELIVERED/CANCELLED) are a
        // strict subset of it.
        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" ADD "status" "public"."orders_status_enum" NOT NULL DEFAULT 'CONFIRMED'`);
        await queryRunner.query(`CREATE INDEX "IDX_order_status_histories_order_created" ON "order_status_histories" ("orderId", "createdAt")`);
        await queryRunner.query(`ALTER TABLE "order_status_histories" ADD CONSTRAINT "FK_order_status_histories_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_status_histories" ADD CONSTRAINT "FK_order_status_histories_user" FOREIGN KEY ("changedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

        // Backfill one synthetic "order placed" row per existing order so the
        // timeline isn't empty for orders created before this migration.
        await queryRunner.query(`
            INSERT INTO "order_status_histories" ("orderId", "previousStatus", "newStatus", "changedByRole", "note", "createdAt")
            SELECT "id", NULL, "status", 'SYSTEM', 'Backfilled — status history introduced after this order was placed', "createdAt"
            FROM "orders"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" DROP COLUMN "status"`);
        await queryRunner.query(`ALTER TABLE "order_status_histories" DROP CONSTRAINT "FK_order_status_histories_user"`);
        await queryRunner.query(`ALTER TABLE "order_status_histories" DROP CONSTRAINT "FK_order_status_histories_order"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_order_status_histories_order_created"`);
        await queryRunner.query(`DROP TABLE "order_status_histories"`);
        await queryRunner.query(`DROP TYPE "public"."order_status_histories_changedbyrole_enum"`);
        // Postgres cannot remove a single enum value; reverting the
        // orders_status_enum addition would require rebuilding the type and
        // is intentionally not automated here (would fail if any row already
        // uses 'PROCESSING').
    }

}
