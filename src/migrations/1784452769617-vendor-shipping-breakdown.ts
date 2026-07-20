import { MigrationInterface, QueryRunner } from "typeorm";

export class VendorShippingBreakdown1784452769617 implements MigrationInterface {
    name = 'VendorShippingBreakdown1784452769617'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Address -> District FK, so shipping comparison can use IDs instead
        // of raw string equality. Backfilled from the existing free-text
        // district column via a case/whitespace-insensitive name match.
        await queryRunner.query(`ALTER TABLE "addresses" ADD "districtId" integer`);
        await queryRunner.query(`
            UPDATE "addresses" a
            SET "districtId" = d.id
            FROM "district" d
            WHERE a."districtId" IS NULL
              AND a."district" IS NOT NULL
              AND regexp_replace(lower(trim(a."district")), '\\s*district$', '') =
                  regexp_replace(lower(trim(d."name")), '\\s*district$', '')
        `);
        await queryRunner.query(`ALTER TABLE "addresses" ADD CONSTRAINT "FK_addresses_district" FOREIGN KEY ("districtId") REFERENCES "district"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);

        // Order-level subtotal/discount/tax split + immutable address snapshot.
        await queryRunner.query(`ALTER TABLE "orders" ADD "merchandiseSubtotal" numeric(10,2)`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "discountTotal" numeric(10,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "taxTotal" numeric(8,2) NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "orders" ADD "shippingAddressSnapshot" jsonb`);

        // Best-effort backfill for existing rows: no historical discount
        // amount was ever persisted, so we can only recover merchandise
        // subtotal assuming zero discount (subtotal = total - shipping).
        await queryRunner.query(`
            UPDATE "orders"
            SET "merchandiseSubtotal" = GREATEST("totalPrice" - "shippingFee", 0)
            WHERE "merchandiseSubtotal" IS NULL
        `);

        // Per-vendor shipping snapshot table: one immutable row per
        // (order, vendor), written once at checkout and never recomputed.
        await queryRunner.query(`
            CREATE TABLE "order_vendor_shippings" (
                "id" SERIAL NOT NULL,
                "orderId" integer NOT NULL,
                "vendorId" integer NOT NULL,
                "vendorNameSnapshot" character varying,
                "vendorDistrictSnapshot" character varying,
                "customerDistrictSnapshot" character varying,
                "shippingZone" character varying NOT NULL,
                "shippingFee" numeric(8,2) NOT NULL,
                "vendorMerchandiseSubtotal" numeric(10,2) NOT NULL,
                "vendorTotal" numeric(10,2) NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_order_vendor_shippings" PRIMARY KEY ("id")
            )
        `);
        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" ADD CONSTRAINT "CHK_order_vendor_shippings_zone" CHECK ("shippingZone" IN ('SAME_DISTRICT', 'CROSS_DISTRICT'))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_order_vendor_shippings_order_vendor" ON "order_vendor_shippings" ("orderId", "vendorId")`);
        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" ADD CONSTRAINT "FK_order_vendor_shippings_order" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" ADD CONSTRAINT "FK_order_vendor_shippings_vendor" FOREIGN KEY ("vendorId") REFERENCES "vendor"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" DROP CONSTRAINT "FK_order_vendor_shippings_vendor"`);
        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" DROP CONSTRAINT "FK_order_vendor_shippings_order"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_order_vendor_shippings_order_vendor"`);
        await queryRunner.query(`ALTER TABLE "order_vendor_shippings" DROP CONSTRAINT "CHK_order_vendor_shippings_zone"`);
        await queryRunner.query(`DROP TABLE "order_vendor_shippings"`);

        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "shippingAddressSnapshot"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "taxTotal"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "discountTotal"`);
        await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "merchandiseSubtotal"`);

        await queryRunner.query(`ALTER TABLE "addresses" DROP CONSTRAINT "FK_addresses_district"`);
        await queryRunner.query(`ALTER TABLE "addresses" DROP COLUMN "districtId"`);
    }

}
