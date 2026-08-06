import { MigrationInterface, QueryRunner } from "typeorm";

export class StaffMgmt1785829238212 implements MigrationInterface {
    name = 'StaffMgmt1785829238212'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Backfill removed enum values in order_status_histories before altering the enum
        await queryRunner.query(`UPDATE "order_status_histories" SET "previousStatus" = 'ORDER_PLACED' WHERE "previousStatus" IN ('PENDING', 'CREATED')`);
        await queryRunner.query(`UPDATE "order_status_histories" SET "newStatus" = 'ORDER_PLACED' WHERE "newStatus" IN ('PENDING', 'CREATED')`);
        await queryRunner.query(`UPDATE "order_status_histories" SET "previousStatus" = 'ASSIGNED_TO_RIDER' WHERE "previousStatus" = 'SHIPPED'`);
        await queryRunner.query(`UPDATE "order_status_histories" SET "newStatus" = 'ASSIGNED_TO_RIDER' WHERE "newStatus" = 'SHIPPED'`);

        await queryRunner.query(`DROP INDEX "public"."IDX_category_age_restricted"`);
        await queryRunner.query(`DROP INDEX "public"."idx_products_catalog_created"`);
        await queryRunner.query(`DROP INDEX "public"."idx_products_normalized_name_trgm"`);
        await queryRunner.query(`DROP INDEX "public"."idx_products_search_text_trgm"`);
        await queryRunner.query(`CREATE TYPE "public"."staff_permissions_module_enum" AS ENUM('order', 'delivery', 'catalog', 'promo', 'deals', 'vendors', 'banner', 'arrangement')`);
        await queryRunner.query(`CREATE TYPE "public"."staff_permissions_permissionlevel_enum" AS ENUM('1', '2', '3')`);
        await queryRunner.query(`CREATE TYPE "public"."staff_permissions_permissionaction_enum" AS ENUM('view', 'create_edit', 'delete', 'unknown')`);
        await queryRunner.query(`CREATE TABLE "staff_permissions" ("id" SERIAL NOT NULL, "staffId" integer NOT NULL, "module" "public"."staff_permissions_module_enum" NOT NULL, "permissionLevel" "public"."staff_permissions_permissionlevel_enum" NOT NULL, "permissionAction" "public"."staff_permissions_permissionaction_enum" NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_e96f8a72909cf05817d9affb5cb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f6ff72a54a4e47f7344e0071d7" ON "staff_permissions" ("staffId", "module") `);
        await queryRunner.query(`ALTER TABLE "promo" ALTER COLUMN "createdAt" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "promo" ALTER COLUMN "updatedAt" SET DEFAULT now()`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b8803301fb653a8e2d4cd3d5f4"`);
        await queryRunner.query(`ALTER TYPE "public"."orders_status_enum" RENAME TO "orders_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."orders_status_enum" AS ENUM('ORDER_PLACED', 'CONFIRMED', 'PROCESSING', 'ARRIVED_AT_WAREHOUSE', 'DELAYED', 'ASSIGNED_TO_RIDER', 'DELIVERED', 'NOT_RECEIVED', 'CANCELLED', 'RETURNED')`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" TYPE "public"."orders_status_enum" USING "status"::"text"::"public"."orders_status_enum"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'ORDER_PLACED'`);
        await queryRunner.query(`DROP TYPE "public"."orders_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "promoApplyOn"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "promoApplyOn" character varying(32)`);
        await queryRunner.query(`ALTER TYPE "public"."order_status_histories_previousstatus_enum" RENAME TO "order_status_histories_previousstatus_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."order_status_histories_previousstatus_enum" AS ENUM('ORDER_PLACED', 'CONFIRMED', 'PROCESSING', 'ARRIVED_AT_WAREHOUSE', 'DELAYED', 'ASSIGNED_TO_RIDER', 'DELIVERED', 'NOT_RECEIVED', 'CANCELLED', 'RETURNED')`);
        await queryRunner.query(`ALTER TABLE "order_status_histories" ALTER COLUMN "previousStatus" TYPE "public"."order_status_histories_previousstatus_enum" USING "previousStatus"::"text"::"public"."order_status_histories_previousstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."order_status_histories_previousstatus_enum_old"`);
        await queryRunner.query(`ALTER TYPE "public"."order_status_histories_newstatus_enum" RENAME TO "order_status_histories_newstatus_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."order_status_histories_newstatus_enum" AS ENUM('ORDER_PLACED', 'CONFIRMED', 'PROCESSING', 'ARRIVED_AT_WAREHOUSE', 'DELAYED', 'ASSIGNED_TO_RIDER', 'DELIVERED', 'NOT_RECEIVED', 'CANCELLED', 'RETURNED')`);
        await queryRunner.query(`ALTER TABLE "order_status_histories" ALTER COLUMN "newStatus" TYPE "public"."order_status_histories_newstatus_enum" USING "newStatus"::"text"::"public"."order_status_histories_newstatus_enum"`);
        await queryRunner.query(`DROP TYPE "public"."order_status_histories_newstatus_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_b8803301fb653a8e2d4cd3d5f4" ON "orders" ("orderedById", "status") `);
        await queryRunner.query(`ALTER TABLE "staff_permissions" ADD CONSTRAINT "FK_4118ed1063c5641c987cb7ea5ea" FOREIGN KEY ("staffId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "staff_permissions" DROP CONSTRAINT "FK_4118ed1063c5641c987cb7ea5ea"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b8803301fb653a8e2d4cd3d5f4"`);
        await queryRunner.query(`CREATE TYPE "public"."order_status_histories_newstatus_enum_old" AS ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'DELAYED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'CREATED', 'ARRIVED_AT_WAREHOUSE', 'ASSIGNED_TO_RIDER', 'NOT_RECEIVED', 'ORDER_PLACED')`);
        await queryRunner.query(`ALTER TABLE "order_status_histories" ALTER COLUMN "newStatus" TYPE "public"."order_status_histories_newstatus_enum_old" USING "newStatus"::"text"::"public"."order_status_histories_newstatus_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."order_status_histories_newstatus_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."order_status_histories_newstatus_enum_old" RENAME TO "order_status_histories_newstatus_enum"`);
        await queryRunner.query(`CREATE TYPE "public"."order_status_histories_previousstatus_enum_old" AS ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'DELAYED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'CREATED', 'ARRIVED_AT_WAREHOUSE', 'ASSIGNED_TO_RIDER', 'NOT_RECEIVED', 'ORDER_PLACED')`);
        await queryRunner.query(`ALTER TABLE "order_status_histories" ALTER COLUMN "previousStatus" TYPE "public"."order_status_histories_previousstatus_enum_old" USING "previousStatus"::"text"::"public"."order_status_histories_previousstatus_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."order_status_histories_previousstatus_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."order_status_histories_previousstatus_enum_old" RENAME TO "order_status_histories_previousstatus_enum"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "promoApplyOn"`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "promoApplyOn" character varying`);
        await queryRunner.query(`CREATE TYPE "public"."orders_status_enum_old" AS ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'DELAYED', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'RETURNED', 'CREATED', 'ARRIVED_AT_WAREHOUSE', 'ASSIGNED_TO_RIDER', 'NOT_RECEIVED', 'ORDER_PLACED')`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" TYPE "public"."orders_status_enum_old" USING "status"::"text"::"public"."orders_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'ORDER_PLACED'`);
        await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."orders_status_enum_old" RENAME TO "orders_status_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_b8803301fb653a8e2d4cd3d5f4" ON "orders" ("orderedById", "status") `);
        await queryRunner.query(`ALTER TABLE "promo" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`ALTER TABLE "promo" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f6ff72a54a4e47f7344e0071d7"`);
        await queryRunner.query(`DROP TABLE "staff_permissions"`);
        await queryRunner.query(`DROP TYPE "public"."staff_permissions_permissionaction_enum"`);
        await queryRunner.query(`DROP TYPE "public"."staff_permissions_permissionlevel_enum"`);
        await queryRunner.query(`DROP TYPE "public"."staff_permissions_module_enum"`);
        await queryRunner.query(`CREATE INDEX "idx_products_search_text_trgm" ON "products" ("search_text") `);
        await queryRunner.query(`CREATE INDEX "idx_products_normalized_name_trgm" ON "products" ("normalized_name") `);
        await queryRunner.query(`CREATE INDEX "idx_products_catalog_created" ON "products" ("created_at") WHERE (deleted_at IS NULL)`);
        await queryRunner.query(`CREATE INDEX "IDX_category_age_restricted" ON "category" ("isAgeRestricted") `);
    }

}
