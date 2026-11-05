import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Staff can be granted broadcasts (push and campaign sends) as their own
 * module instead of the feature being admin-only.
 */
export class BroadcastPermission1788400000000 implements MigrationInterface {
    name = "BroadcastPermission1788400000000";
    // ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older Postgres.
    transaction = false;

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TYPE "public"."staff_permissions_module_enum" ADD VALUE IF NOT EXISTS 'broadcast'`,
        );
    }

    public async down(): Promise<void> {
        // Postgres cannot drop a value from an enum type.
    }
}
