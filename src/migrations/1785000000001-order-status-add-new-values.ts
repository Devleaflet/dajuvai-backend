import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderStatusAddNewValues1785000000001 implements MigrationInterface {
    name = 'OrderStatusAddNewValues1785000000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // New unified-status labels. Postgres enum values can only be added,
        // never renamed/removed in place — PENDING and SHIPPED are left as
        // permanently-unused labels on the type rather than attempting a
        // full type rebuild, matching the precedent set by the migration
        // that first added PROCESSING (1784455956678).
        await queryRunner.query(`ALTER TYPE "public"."orders_status_enum" ADD VALUE IF NOT EXISTS 'CREATED'`);
        await queryRunner.query(`ALTER TYPE "public"."orders_status_enum" ADD VALUE IF NOT EXISTS 'ARRIVED_AT_WAREHOUSE'`);
        await queryRunner.query(`ALTER TYPE "public"."orders_status_enum" ADD VALUE IF NOT EXISTS 'ASSIGNED_TO_RIDER'`);
        await queryRunner.query(`ALTER TYPE "public"."orders_status_enum" ADD VALUE IF NOT EXISTS 'NOT_RECEIVED'`);

        // Riders now write order_status_histories rows directly (previously
        // their actions bypassed the audit log entirely) — the
        // changedByRole enum needs a value for them.
        await queryRunner.query(`ALTER TYPE "public"."order_status_histories_changedbyrole_enum" ADD VALUE IF NOT EXISTS 'RIDER'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Postgres cannot remove a single enum value without rebuilding the
        // type; not automated here (would fail if any row already uses one
        // of these values) — matching the precedent in 1784455956678.
    }
}
