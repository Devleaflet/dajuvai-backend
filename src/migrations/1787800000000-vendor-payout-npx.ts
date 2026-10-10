import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Vendor payout methods become eSewa, Khalti and NPX.
 *
 * NPX pays into a bank account, so the old BANK rows (bank details) become NPX
 * rows as they are, and NPS (the gateway's old name, also bank details) does
 * too. A vendor holding both BANK and NPS would collide on the
 * (vendorId, paymentType) unique key; the NPS row is the one dropped.
 * Postgres cannot remove enum values, so the type is rebuilt.
 */
export class VendorPayoutNpx1787800000000 implements MigrationInterface {
    name = "VendorPayoutNpx1787800000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DELETE FROM "vendor_payment_option" n
            USING "vendor_payment_option" b
            WHERE n."paymentType" = 'NPS' AND b."paymentType" = 'BANK' AND n."vendorId" = b."vendorId"
        `);
        await queryRunner.query(`ALTER TYPE "public"."vendor_payment_option_paymenttype_enum" RENAME TO "vendor_payment_option_paymenttype_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."vendor_payment_option_paymenttype_enum" AS ENUM('ESEWA', 'KHALTI', 'NPX')`);
        await queryRunner.query(`
            ALTER TABLE "vendor_payment_option" ALTER COLUMN "paymentType" TYPE "public"."vendor_payment_option_paymenttype_enum"
            USING (CASE WHEN "paymentType"::text IN ('BANK', 'NPS') THEN 'NPX' ELSE "paymentType"::text END)::"public"."vendor_payment_option_paymenttype_enum"
        `);
        await queryRunner.query(`DROP TYPE "public"."vendor_payment_option_paymenttype_enum_old"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TYPE "public"."vendor_payment_option_paymenttype_enum" RENAME TO "vendor_payment_option_paymenttype_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."vendor_payment_option_paymenttype_enum" AS ENUM('ESEWA', 'KHALTI', 'BANK', 'NPS')`);
        await queryRunner.query(`
            ALTER TABLE "vendor_payment_option" ALTER COLUMN "paymentType" TYPE "public"."vendor_payment_option_paymenttype_enum"
            USING (CASE WHEN "paymentType"::text = 'NPX' THEN 'BANK' ELSE "paymentType"::text END)::"public"."vendor_payment_option_paymenttype_enum"
        `);
        await queryRunner.query(`DROP TYPE "public"."vendor_payment_option_paymenttype_enum_old"`);
    }
}
