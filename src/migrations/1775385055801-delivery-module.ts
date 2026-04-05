import { MigrationInterface, QueryRunner } from "typeorm";

export class DeliveryModule1775385055801 implements MigrationInterface {
    name = 'DeliveryModule1775385055801'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "delivery_assignments" ("id" SERIAL NOT NULL, "orderId" integer NOT NULL, "riderId" integer NOT NULL, "assignmentStatus" character varying NOT NULL DEFAULT 'assigned', "pickedUpAt" TIMESTAMP, "deliveredAt" TIMESTAMP, "failureReason" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_d1cfabf26db04a5282217fb7b83" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "riders" ("id" SERIAL NOT NULL, "fullName" character varying NOT NULL, "phoneNumber" character varying NOT NULL, "email" character varying, "onDelivery" boolean NOT NULL DEFAULT false, "userId" integer, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_f39a5e11e87c3327af152820062" UNIQUE ("phoneNumber"), CONSTRAINT "UQ_28d2f063ec2ca9775e57754bf0a" UNIQUE ("userId"), CONSTRAINT "REL_28d2f063ec2ca9775e57754bf0" UNIQUE ("userId"), CONSTRAINT "PK_6c17e67f760677500c29d68e689" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."orders_deliverystatus_enum" AS ENUM('order_processing', 'at_warehouse', 'ready_for_delivery', 'rider_assigned', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned_warehouse')`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "deliveryStatus" "public"."orders_deliverystatus_enum" NOT NULL DEFAULT 'order_processing'`);
        await queryRunner.query(`ALTER TABLE "order_items" ADD "collectedAtWarehouse" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TYPE "public"."user_role_enum" RENAME TO "user_role_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."user_role_enum" AS ENUM('admin', 'user', 'staff', 'rider')`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" TYPE "public"."user_role_enum" USING "role"::"text"::"public"."user_role_enum"`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user'`);
        await queryRunner.query(`DROP TYPE "public"."user_role_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_1f4b9818a08b822a31493fdee9" ON "orders" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_01b20118a3f640214e7a8a6b29" ON "orders" ("paymentStatus") `);
        await queryRunner.query(`CREATE INDEX "IDX_b8803301fb653a8e2d4cd3d5f4" ON "orders" ("orderedById", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_e12875dfb3b1d92d7d7c5377e2" ON "user" ("email") `);
        await queryRunner.query(`CREATE INDEX "IDX_f2578043e491921209f5dadd08" ON "user" ("phoneNumber") `);
        await queryRunner.query(`CREATE INDEX "IDX_aefd8dd815205b4021f47ab690" ON "user" ("email", "isVerified") `);
        await queryRunner.query(`ALTER TABLE "delivery_assignments" ADD CONSTRAINT "FK_7087f6eb93590acbb62ed7ab85a" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "delivery_assignments" ADD CONSTRAINT "FK_0733f777fb2991129a67163e979" FOREIGN KEY ("riderId") REFERENCES "riders"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "riders" ADD CONSTRAINT "FK_28d2f063ec2ca9775e57754bf0a" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "riders" DROP CONSTRAINT "FK_28d2f063ec2ca9775e57754bf0a"`);
        await queryRunner.query(`ALTER TABLE "delivery_assignments" DROP CONSTRAINT "FK_0733f777fb2991129a67163e979"`);
        await queryRunner.query(`ALTER TABLE "delivery_assignments" DROP CONSTRAINT "FK_7087f6eb93590acbb62ed7ab85a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_aefd8dd815205b4021f47ab690"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f2578043e491921209f5dadd08"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e12875dfb3b1d92d7d7c5377e2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b8803301fb653a8e2d4cd3d5f4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_01b20118a3f640214e7a8a6b29"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1f4b9818a08b822a31493fdee9"`);
        await queryRunner.query(`CREATE TYPE "public"."user_role_enum_old" AS ENUM('admin', 'user', 'staff')`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" TYPE "public"."user_role_enum_old" USING "role"::"text"::"public"."user_role_enum_old"`);
        await queryRunner.query(`ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user'`);
        await queryRunner.query(`DROP TYPE "public"."user_role_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."user_role_enum_old" RENAME TO "user_role_enum"`);
        await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "collectedAtWarehouse"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "deliveryStatus"`);
        await queryRunner.query(`DROP TYPE "public"."orders_deliverystatus_enum"`);
        await queryRunner.query(`DROP TABLE "riders"`);
        await queryRunner.query(`DROP TABLE "delivery_assignments"`);
    }

}
