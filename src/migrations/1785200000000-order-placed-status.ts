import { MigrationInterface, QueryRunner } from "typeorm";

export class OrderPlacedStatus1785200000000 implements MigrationInterface {
    name = "OrderPlacedStatus1785200000000";
    public transaction = false;

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `ALTER TYPE "public"."orders_status_enum" ADD VALUE IF NOT EXISTS 'ORDER_PLACED'`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."order_status_histories_previousstatus_enum" ADD VALUE IF NOT EXISTS 'ORDER_PLACED'`,
        );
        await queryRunner.query(
            `ALTER TYPE "public"."order_status_histories_newstatus_enum" ADD VALUE IF NOT EXISTS 'ORDER_PLACED'`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'ORDER_PLACED'`,
        );
        await queryRunner.query(
            `UPDATE "orders" SET "status" = 'ORDER_PLACED' WHERE "status" = 'CREATED'`,
        );
        await queryRunner.query(
            `UPDATE "order_status_histories" SET "previousStatus" = 'ORDER_PLACED' WHERE "previousStatus" = 'CREATED'`,
        );
        await queryRunner.query(
            `UPDATE "order_status_histories" SET "newStatus" = 'ORDER_PLACED' WHERE "newStatus" = 'CREATED'`,
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(
            `UPDATE "orders" SET "status" = 'CREATED' WHERE "status" = 'ORDER_PLACED'`,
        );
        await queryRunner.query(
            `UPDATE "order_status_histories" SET "previousStatus" = 'CREATED' WHERE "previousStatus" = 'ORDER_PLACED'`,
        );
        await queryRunner.query(
            `UPDATE "order_status_histories" SET "newStatus" = 'CREATED' WHERE "newStatus" = 'ORDER_PLACED'`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'CREATED'`,
        );
    }
}
