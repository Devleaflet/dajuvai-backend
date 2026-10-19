import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Indexes for the delivery admin lists, and a repair of assignments older code
 * left open.
 *
 * 1. **Indexes.** `delivery_assignments` had only its primary key, yet every
 *    delivery list filters it by order, rider or status, and the order list
 *    reads each order's latest assignment. `orders.status` is what the delivery
 *    order list filters on first.
 *
 * 2. **Open assignments on orders that left the rider.** Until now an admin
 *    cancelling, delivering or returning an order from the orders page left its
 *    assignment `assigned`. On the local copy of production that was 40 of 45
 *    open assignments — 38 on CANCELLED orders. They are closed the way
 *    `changeOrderStatus` now closes them: `delivered` for a DELIVERED order,
 *    `failed` for NOT_RECEIVED, `none` (cleared) otherwise. An order still
 *    ASSIGNED_TO_RIDER keeps only its newest open assignment; older ones were
 *    superseded and become `reassigned`.
 *
 * 3. **`riders.onDelivery`** is recomputed from what is still open, since the
 *    old toggling freed riders who were still carrying other orders.
 *
 * `down` drops the indexes only. The repaired rows are not reopened: there is
 * no record of which ones were changed, and reopening them would bring back
 * the wrong state.
 */
export class DeliveryIndexesAndAssignmentRepair1787900000000 implements MigrationInterface {
    name = "DeliveryIndexesAndAssignmentRepair1787900000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_delivery_assignments_order_id"
            ON "delivery_assignments" ("orderId")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_delivery_assignments_rider_id"
            ON "delivery_assignments" ("riderId")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_delivery_assignments_status"
            ON "delivery_assignments" ("assignmentStatus")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_orders_status"
            ON "orders" ("status")
        `);

        await queryRunner.query(`
            UPDATE "delivery_assignments" da
            SET "assignmentStatus" = CASE o."status"
                    WHEN 'DELIVERED' THEN 'delivered'
                    WHEN 'NOT_RECEIVED' THEN 'failed'
                    ELSE 'none'
                END,
                "deliveredAt" = CASE
                    WHEN o."status" = 'DELIVERED' THEN COALESCE(da."deliveredAt", o."updatedAt")
                    ELSE da."deliveredAt"
                END,
                "failureReason" = CASE
                    WHEN o."status" = 'NOT_RECEIVED'
                        THEN COALESCE(da."failureReason", 'Marked not received by an administrator')
                    ELSE da."failureReason"
                END
            FROM "orders" o
            WHERE o.id = da."orderId"
              AND da."assignmentStatus" IN ('assigned', 'picked_up')
              AND o."status" <> 'ASSIGNED_TO_RIDER'
        `);

        await queryRunner.query(`
            UPDATE "delivery_assignments" da
            SET "assignmentStatus" = 'reassigned'
            WHERE da."assignmentStatus" IN ('assigned', 'picked_up')
              AND EXISTS (
                  SELECT 1 FROM "delivery_assignments" newer
                  WHERE newer."orderId" = da."orderId" AND newer.id > da.id
              )
        `);

        await queryRunner.query(`
            UPDATE "riders" r
            SET "onDelivery" = EXISTS (
                SELECT 1 FROM "delivery_assignments" da
                WHERE da."riderId" = r.id AND da."assignmentStatus" IN ('assigned', 'picked_up')
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_orders_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_delivery_assignments_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_delivery_assignments_rider_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_delivery_assignments_order_id"`);
    }
}
