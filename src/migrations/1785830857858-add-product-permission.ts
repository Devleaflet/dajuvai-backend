import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProductPermission1785830857858 implements MigrationInterface {
    name = 'AddProductPermission1785830857858'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."staff_permissions_module_enum" ADD VALUE IF NOT EXISTS 'product'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Postgres does not support easily dropping values from an enum type
    }
}
