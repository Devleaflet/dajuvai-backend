import { MigrationInterface, QueryRunner } from "typeorm";

export class WishlistUniqueness1784364000000 implements MigrationInterface {
    name = "WishlistUniqueness1784364000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            WITH ranked_wishlists AS (
                SELECT
                    "id",
                    FIRST_VALUE("id") OVER (PARTITION BY "userId" ORDER BY "id") AS "keeperId",
                    ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "id") AS "rank"
                FROM "wishlists"
            )
            UPDATE "wishlist_items" AS "item"
            SET "wishlist_id" = "ranked"."keeperId"
            FROM "ranked_wishlists" AS "ranked"
            WHERE "item"."wishlist_id" = "ranked"."id"
                AND "ranked"."rank" > 1
        `);

        await queryRunner.query(`
            WITH ranked_items AS (
                SELECT
                    "id",
                    ROW_NUMBER() OVER (
                        PARTITION BY "wishlist_id", "productId", COALESCE("variantId", -1)
                        ORDER BY "id"
                    ) AS "rank"
                FROM "wishlist_items"
            )
            DELETE FROM "wishlist_items" AS "item"
            USING "ranked_items" AS "ranked"
            WHERE "item"."id" = "ranked"."id"
                AND "ranked"."rank" > 1
        `);

        await queryRunner.query(`
            WITH ranked_wishlists AS (
                SELECT
                    "id",
                    ROW_NUMBER() OVER (PARTITION BY "userId" ORDER BY "id") AS "rank"
                FROM "wishlists"
            )
            DELETE FROM "wishlists" AS "wishlist"
            USING "ranked_wishlists" AS "ranked"
            WHERE "wishlist"."id" = "ranked"."id"
                AND "ranked"."rank" > 1
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wishlists_user_unique"
            ON "wishlists" ("userId")
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wishlist_items_product_unique"
            ON "wishlist_items" ("wishlist_id", "productId")
            WHERE "variantId" IS NULL
        `);

        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_wishlist_items_variant_unique"
            ON "wishlist_items" ("wishlist_id", "productId", "variantId")
            WHERE "variantId" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wishlist_items_variant_unique"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wishlist_items_product_unique"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_wishlists_user_unique"`);
    }
}
