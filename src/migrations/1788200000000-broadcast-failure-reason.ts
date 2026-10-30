import { MigrationInterface, QueryRunner } from "typeorm";

/** Why a broadcast failed to start, for the admin; the worker log is not theirs to read. */
export class BroadcastFailureReason1788200000000 implements MigrationInterface {
    name = "BroadcastFailureReason1788200000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "broadcasts" ADD COLUMN IF NOT EXISTS "failureReason" varchar(300)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "broadcasts" DROP COLUMN IF EXISTS "failureReason"`);
    }
}
