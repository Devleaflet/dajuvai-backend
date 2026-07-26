import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * order_status_histories.previousStatus/newStatus were created (in
 * 1784829181593-precision_change.ts) with their OWN separate enum types —
 * order_status_histories_previousstatus_enum and
 * order_status_histories_newstatus_enum — not a reuse of orders_status_enum
 * as the doc-comment on that migration's changedByRole section implied.
 * 1785000000001 only added the 4 new labels to orders_status_enum, missing
 * these two, so writing a history row for any of the 4 new statuses failed
 * with "invalid input value for enum order_status_histories_newstatus_enum"
 * — caught by manually smoke-testing the live endpoint after the earlier
 * migrations, not by the self-check script (which has no DB).
 */
export class OrderStatusHistoryEnumFix1785000000003 implements MigrationInterface {
    name = 'OrderStatusHistoryEnumFix1785000000003'

    public async up(queryRunner: QueryRunner): Promise<void> {
        for (const value of ['CREATED', 'ARRIVED_AT_WAREHOUSE', 'ASSIGNED_TO_RIDER', 'NOT_RECEIVED']) {
            await queryRunner.query(`ALTER TYPE "public"."order_status_histories_previousstatus_enum" ADD VALUE IF NOT EXISTS '${value}'`);
            await queryRunner.query(`ALTER TYPE "public"."order_status_histories_newstatus_enum" ADD VALUE IF NOT EXISTS '${value}'`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Postgres cannot remove a single enum value without rebuilding the
        // type; not automated here (would fail if any row already uses one
        // of these values).
    }
}
