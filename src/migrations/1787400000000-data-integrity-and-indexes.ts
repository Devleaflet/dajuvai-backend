import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Data-integrity constraints, webhook de-duplication, and the indexes the hot
 * reads were missing.
 *
 * Three groups, all additive — no column is dropped, no type is changed, and
 * nothing here rewrites a row. That is deliberate: the old code keeps working
 * against this schema, so it can be applied before a deploy rather than with
 * one.
 *
 * Verified against the live database before writing: zero products with
 * negative stock or price, zero orders with a negative total, zero duplicate
 * `idempotencyKey`, zero duplicate `mTransactionId`. Every constraint below is
 * therefore satisfiable today, and `NOT VALID` is not needed.
 *
 * 1. **`processed_webhooks`** — one row per gateway event, unique on
 *    `(provider, eventId)`. The payment webhook is currently idempotent only
 *    by consequence: it looks up the order or draft and finds it already
 *    terminal. That holds for the cases we know of, and says nothing about a
 *    provider that retries with a *new* transaction reference. A dedupe table
 *    makes "this event was handled" a fact rather than an inference.
 *
 * 2. **CHECK constraints** — the database is the last line. A service bug that
 *    computes a negative total, or a race that drives stock below zero, is
 *    caught here instead of being sold.
 *
 * 3. **Indexes on foreign keys and filters.** Postgres does not index the
 *    referencing side of a foreign key. `order_items.orderId` had no index at
 *    all, so every order detail read was a sequential scan, as was every
 *    vendor's order list and every cart read. The tables are small today (285
 *    order items), which is exactly when to add them: the scan is invisible now
 *    and is the first thing to hurt at ten thousand.
 */
export class DataIntegrityAndIndexes1787400000000 implements MigrationInterface {
    name = "DataIntegrityAndIndexes1787400000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        /* ---------------------------------------------------------------- */
        /* 1. Webhook de-duplication                                         */
        /* ---------------------------------------------------------------- */

        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "processed_webhooks" (
                "id" SERIAL PRIMARY KEY,
                "provider" character varying(32) NOT NULL,
                "eventId" character varying(191) NOT NULL,
                "orderId" integer,
                "payload" jsonb,
                "processedAt" TIMESTAMP NOT NULL DEFAULT now()
            )
        `);

        // The whole point of the table. A duplicate delivery violates this and
        // the handler answers 200 without charging, shipping or decrementing
        // stock a second time.
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_processed_webhooks_provider_event"
            ON "processed_webhooks" ("provider", "eventId")
        `);

        // For the cleanup job that trims events older than the retention
        // window, and for answering "what did the gateway send us that day".
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_processed_webhooks_processed_at"
            ON "processed_webhooks" ("processedAt")
        `);

        /* ---------------------------------------------------------------- */
        /* 2. Integrity constraints                                          */
        /* ---------------------------------------------------------------- */

        // One gateway transaction belongs to one order. Without this a
        // reconciliation that matches on `mTransactionId` can return two rows,
        // and there is no honest way to decide which was paid for.
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "UQ_orders_m_transaction_id"
            ON "orders" ("mTransactionId")
            WHERE "mTransactionId" IS NOT NULL
        `);

        await queryRunner.query(`
            ALTER TABLE "products"
            ADD CONSTRAINT "CHK_products_stock_non_negative" CHECK ("stock" >= 0)
        `);

        await queryRunner.query(`
            ALTER TABLE "products"
            ADD CONSTRAINT "CHK_products_base_price_non_negative" CHECK ("basePrice" >= 0)
        `);

        // `stockReserved` is what pending checkouts hold. Only the floor is
        // asserted: a ceiling against `stock` would be wrong, because the two
        // move independently while a draft is open.
        await queryRunner.query(`
            ALTER TABLE "products"
            ADD CONSTRAINT "CHK_products_stock_reserved_non_negative"
            CHECK ("stockReserved" >= 0)
        `);

        await queryRunner.query(`
            ALTER TABLE "variants"
            ADD CONSTRAINT "CHK_variants_stock_non_negative" CHECK ("stock" >= 0)
        `);

        await queryRunner.query(`
            ALTER TABLE "orders"
            ADD CONSTRAINT "CHK_orders_totals_non_negative"
            CHECK (
                "totalPrice" >= 0
                AND "shippingFee" >= 0
                AND "discountTotal" >= 0
                AND "taxTotal" >= 0
            )
        `);

        await queryRunner.query(`
            ALTER TABLE "order_items"
            ADD CONSTRAINT "CHK_order_items_quantity_positive" CHECK ("quantity" > 0)
        `);

        await queryRunner.query(`
            ALTER TABLE "cart_items"
            ADD CONSTRAINT "CHK_cart_items_quantity_positive" CHECK ("quantity" > 0)
        `);

        /* ---------------------------------------------------------------- */
        /* 3. Indexes for the reads that run on every page                   */
        /* ---------------------------------------------------------------- */

        // Order detail, vendor order lists, and the fulfilment views.
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_order_items_order_id"
            ON "order_items" ("orderId")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_order_items_vendor_id"
            ON "order_items" ("vendorId")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_order_items_product_id"
            ON "order_items" ("productId")
        `);

        // Every cart read joins on this.
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_cart_items_cart_id"
            ON "cart_items" ("cart_id")
        `);

        // The catalogue's own filters: a subcategory listing, a vendor's shop,
        // and "newest first", which is the default sort.
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_products_subcategory_status"
            ON "products" ("subcategoryId", "status")
            WHERE "deleted_at" IS NULL
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_products_vendor_id"
            ON "products" ("vendorId")
            WHERE "deleted_at" IS NULL
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_products_created_at"
            ON "products" ("created_at" DESC)
            WHERE "deleted_at" IS NULL
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_variants_product_id"
            ON "variants" ("product_id")
        `);

        // The promo ledger is read per user on every checkout that carries a
        // code, to enforce the per-user usage limit.
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_promo_redemption_user_id"
            ON "promo_redemption" ("userId")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_promo_redemption_user_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_variants_product_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_created_at"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_vendor_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_products_subcategory_status"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_cart_items_cart_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_items_product_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_items_vendor_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_order_items_order_id"`);

        await queryRunner.query(
            `ALTER TABLE "cart_items" DROP CONSTRAINT IF EXISTS "CHK_cart_items_quantity_positive"`,
        );
        await queryRunner.query(
            `ALTER TABLE "order_items" DROP CONSTRAINT IF EXISTS "CHK_order_items_quantity_positive"`,
        );
        await queryRunner.query(
            `ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "CHK_orders_totals_non_negative"`,
        );
        await queryRunner.query(
            `ALTER TABLE "variants" DROP CONSTRAINT IF EXISTS "CHK_variants_stock_non_negative"`,
        );
        await queryRunner.query(
            `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CHK_products_stock_reserved_non_negative"`,
        );
        await queryRunner.query(
            `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CHK_products_base_price_non_negative"`,
        );
        await queryRunner.query(
            `ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "CHK_products_stock_non_negative"`,
        );

        await queryRunner.query(`DROP INDEX IF EXISTS "UQ_orders_m_transaction_id"`);

        // The dedupe table is kept on `down`: dropping it would throw away the
        // record of which gateway events have been handled, and a replay after
        // a rollback would then be processed twice.
    }
}
