import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCategory1785863268883 implements MigrationInterface {
    name = 'AddCategory1785863268883'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_f6ff72a54a4e47f7344e0071d7"`);
        await queryRunner.query(`ALTER TYPE "public"."staff_permissions_module_enum" RENAME TO "staff_permissions_module_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."staff_permissions_module_enum" AS ENUM('arrangement', 'banner', 'catalog', 'category', 'customer', 'deal', 'delivery', 'order', 'product', 'promo', 'vendor')`);
        await queryRunner.query(`ALTER TABLE "staff_permissions" ALTER COLUMN "module" TYPE "public"."staff_permissions_module_enum" USING "module"::"text"::"public"."staff_permissions_module_enum"`);
        await queryRunner.query(`DROP TYPE "public"."staff_permissions_module_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_f6ff72a54a4e47f7344e0071d7" ON "staff_permissions" ("staffId", "module") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_f6ff72a54a4e47f7344e0071d7"`);
        await queryRunner.query(`CREATE TYPE "public"."staff_permissions_module_enum_old" AS ENUM('arrangement', 'banner', 'catalog', 'commission', 'customer', 'deal', 'delivery', 'order', 'product', 'promo', 'vendor')`);
        await queryRunner.query(`ALTER TABLE "staff_permissions" ALTER COLUMN "module" TYPE "public"."staff_permissions_module_enum_old" USING "module"::"text"::"public"."staff_permissions_module_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."staff_permissions_module_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."staff_permissions_module_enum_old" RENAME TO "staff_permissions_module_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_f6ff72a54a4e47f7344e0071d7" ON "staff_permissions" ("module", "staffId") `);
    }

}
