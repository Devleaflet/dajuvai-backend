import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCheckoutDrafts1787200000001 implements MigrationInterface {
  name = "CreateCheckoutDrafts1787200000001";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."checkout_drafts_status_enum" AS ENUM('PENDING', 'COMPLETED', 'CANCELLED', 'EXPIRED')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."checkout_drafts_paymentmethod_enum" AS ENUM('ONLINE_PAYMENT', 'CASH_ON_DELIVERY', 'KHALTI', 'ESEWA', 'NPX')`,
    );
    await queryRunner.query(
      `CREATE TABLE "checkout_drafts" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "status" "public"."checkout_drafts_status_enum" NOT NULL DEFAULT 'PENDING',
        "paymentMethod" "public"."checkout_drafts_paymentmethod_enum" NOT NULL,
        "orderNumber" character varying NOT NULL,
        "payload" jsonb NOT NULL,
        "items" jsonb NOT NULL,
        "totals" jsonb NOT NULL,
        "addressId" integer,
        "mTransactionId" character varying,
        "esewaTransactionUuid" character varying,
        "orderId" integer,
        "expiresAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_checkout_drafts_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_checkout_drafts_user_id" ON "checkout_drafts" ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_checkout_drafts_user_status" ON "checkout_drafts" ("userId", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_checkout_drafts_expires_at" ON "checkout_drafts" ("expiresAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_checkout_drafts_m_transaction_id" ON "checkout_drafts" ("mTransactionId")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "checkout_drafts"`);
    await queryRunner.query(`DROP TYPE "public"."checkout_drafts_paymentmethod_enum"`);
    await queryRunner.query(`DROP TYPE "public"."checkout_drafts_status_enum"`);
  }
}
