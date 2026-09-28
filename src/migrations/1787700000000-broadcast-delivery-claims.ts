import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Builds on 1785900000000's broadcast tables.
 *
 * - `claimedBy`/`claimedAt` let a channel job take its deliveries atomically,
 *   so a retried or recovered job can never send the same message twice.
 * - Result counters on `broadcasts` keep the list page off the deliveries
 *   table, which grows with audience × channels.
 * - (broadcastId, id) on recipients backs the id-range batching.
 */
export class BroadcastDeliveryClaims1787700000000 implements MigrationInterface {
    name = "BroadcastDeliveryClaims1787700000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "broadcast_deliveries" ADD COLUMN IF NOT EXISTS "claimedBy" varchar(100)`);
        await queryRunner.query(`ALTER TABLE "broadcast_deliveries" ADD COLUMN IF NOT EXISTS "claimedAt" timestamptz`);
        for (const column of ["totalRecipients", "sentCount", "failedCount", "skippedCount"]) {
            await queryRunner.query(`ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "${column}" integer NOT NULL DEFAULT 0`);
        }
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_broadcast_recipients_broadcast_id" ON "broadcast_recipients" ("broadcastId", "id")`);
        // Broadcasts that settled before the counters existed.
        await queryRunner.query(`
            UPDATE "broadcasts" b SET
                "totalRecipients" = c.recipients,
                "sentCount" = c.sent,
                "failedCount" = c.failed,
                "skippedCount" = c.skipped
            FROM (
                SELECT r."broadcastId",
                       COUNT(DISTINCT r."id")::int AS recipients,
                       COUNT(d."id") FILTER (WHERE d."status" = 'SENT')::int AS sent,
                       COUNT(d."id") FILTER (WHERE d."status" = 'FAILED')::int AS failed,
                       COUNT(d."id") FILTER (WHERE d."status" = 'SKIPPED')::int AS skipped
                FROM "broadcast_recipients" r
                LEFT JOIN "broadcast_deliveries" d ON d."broadcastRecipientId" = r."id"
                GROUP BY r."broadcastId"
            ) c
            WHERE c."broadcastId" = b."id"
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_broadcast_recipients_broadcast_id"`);
        for (const column of ["skippedCount", "failedCount", "sentCount", "totalRecipients"]) {
            await queryRunner.query(`ALTER TABLE "broadcasts" DROP COLUMN IF EXISTS "${column}"`);
        }
        await queryRunner.query(`ALTER TABLE "broadcast_deliveries" DROP COLUMN IF EXISTS "claimedAt"`);
        await queryRunner.query(`ALTER TABLE "broadcast_deliveries" DROP COLUMN IF EXISTS "claimedBy"`);
    }
}
