import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * changeOrderStatus now keeps `deliveryStatus` in step with the order status.
 * Orders moved before that kept "order_processing" to the end, so the admin
 * Delivery column read "Processing" on delivered orders. Same mapping as
 * DELIVERY_STATUS_FOR_ORDER_STATUS in order.service.ts.
 */
export class BackfillDeliveryStatus1788500000000 implements MigrationInterface {
    name = "BackfillDeliveryStatus1788500000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            UPDATE "orders" SET "deliveryStatus" = (CASE "status"
                WHEN 'ARRIVED_AT_WAREHOUSE' THEN 'at_warehouse'
                WHEN 'ASSIGNED_TO_RIDER' THEN 'rider_assigned'
                WHEN 'DELIVERED' THEN 'delivered'
                WHEN 'NOT_RECEIVED' THEN 'delivery_failed'
                WHEN 'RETURNED' THEN 'returned_warehouse'
            END)::"orders_deliverystatus_enum"
            WHERE "status" IN ('ARRIVED_AT_WAREHOUSE', 'ASSIGNED_TO_RIDER', 'DELIVERED', 'NOT_RECEIVED', 'RETURNED')
              AND "deliveryStatus" = 'order_processing'
        `);
    }

    public async down(): Promise<void> {
        // The previous values were stale; there is nothing correct to restore.
    }
}
