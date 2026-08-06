import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCommissionPermission1785830857857 implements MigrationInterface {
    name = 'AddCommissionPermission1785830857857'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."staff_permissions_module_enum" ADD VALUE IF NOT EXISTS 'commission'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Postgres does not support easily dropping values from an enum type
    }
}
