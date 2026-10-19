import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCustomerPermission1785830857856 implements MigrationInterface {
    name = 'AddCustomerPermission1785830857856'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."staff_permissions_module_enum" ADD VALUE IF NOT EXISTS 'customer'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Postgres does not support easily dropping values from an enum type
    }
}
