import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderStatusBackfillAndDropVendorStatus1785000000002 implements MigrationInterface {
    name = 'OrderStatusBackfillAndDropVendorStatus1785000000002'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // ── Backfill existing rows onto the new unified status values ──────
        // Must run in a later migration (later transaction) than the one that
        // added these enum labels — Postgres forbids using a brand-new enum
        // value inside the same transaction that created it.

        // PENDING was the "just placed, unpaid/COD-unconfirmed" state.
        await queryRunner.query(`UPDATE "orders" SET "status" = 'CREATED' WHERE "status" = 'PENDING'`);

        // SHIPPED only ever meant "handed to a rider" in the old model
        // (order.service.ts and delivery.rider.service.ts both only ever
        // set status=SHIPPED for that exact stage) — no deliveryStatus
        // filter needed, every SHIPPED row already implies rider-assigned.
        await queryRunner.query(`UPDATE "orders" SET "status" = 'ASSIGNED_TO_RIDER' WHERE "status" = 'SHIPPED'`);

        // PROCESSING/DELAYED rows that had progressed further in the
        // deliveryStatus lifecycle (reached the warehouse) get bumped to
        // the new coarse-grained ARRIVED_AT_WAREHOUSE value; rows still at
        // deliveryStatus=order_processing stay PROCESSING/DELAYED as-is.
        await queryRunner.query(`
            UPDATE "orders" SET "status" = 'ARRIVED_AT_WAREHOUSE'
            WHERE "status" IN ('PROCESSING', 'DELAYED')
              AND "deliveryStatus" IN ('at_warehouse', 'ready_for_delivery')
        `);

        // deliveryStatus=delivery_failed is set by two different paths:
        // a real courier delivery failure (order.status was ASSIGNED_TO_RIDER
        // by now, from the update above) and a payment-gateway failure
        // (esewaFailed/verifyPayment, which always also sets status=CANCELLED
        // in the same write). The CANCELLED guard keeps payment failures
        // correctly excluded — only true delivery failures get NOT_RECEIVED.
        await queryRunner.query(`
            UPDATE "orders" SET "status" = 'NOT_RECEIVED'
            WHERE "deliveryStatus" = 'delivery_failed'
              AND "status" != 'CANCELLED'
        `);

        // RETURNED_WAREHOUSE is defined on DeliveryStatus but nothing in the
        // current codebase ever sets it — defensive backfill in case any
        // row somehow has it, harmless no-op otherwise.
        await queryRunner.query(`
            UPDATE "orders" SET "status" = 'RETURNED'
            WHERE "deliveryStatus" = 'returned_warehouse'
              AND "status" != 'CANCELLED'
        `);

        // ── Vendors are read-only now — drop their per-vendor status column ──
        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" DROP COLUMN "status"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" ADD "status" "public"."orders_status_enum" NOT NULL DEFAULT 'CONFIRMED'`);
        // The status backfill is not reversed — same precedent as
        // 1784455956678's backfilled history rows, which also aren't
        // undone on down(). Re-deriving the exact prior (status,
        // deliveryStatus) pair per row is not attempted.
    }
}
