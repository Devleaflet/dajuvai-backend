import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Replaces the 7-placement (mega menu / homepage / mobile / search / category
 * grid / featured / deals) merchandising schema with the 2-placement
 * placements/placement_items model: a single polymorphic placement_items
 * table (entity_type + entity_id) instead of one join table per catalog type,
 * and no featured/pinned flags (spec: What NOT to Build).
 *
 * This is a one-way replacement, not a superset: down() drops the new tables
 * but does not resurrect category_placement/subcategory_placement/placement
 * or their data - that schema and its rows are gone by design.
 *
 * A third placement, 'homepage', is seeded alongside the two the spec asks
 * for. It is not exposed in the new Arrangements admin UI - it exists purely
 * so the pre-existing /api/home/category/section endpoint (the "pick up to 5
 * homepage categories" picker on the Categories admin page) keeps working
 * instead of breaking outright when category_placement is dropped.
 */
export class PlacementsArrangements1784359092701 implements MigrationInterface {
    name = "PlacementsArrangements1784359092701";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "subcategory_placement"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "category_placement"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "placement"`);

        await queryRunner.query(`
            CREATE TABLE "placements" (
                "id" SERIAL NOT NULL,
                "name" character varying(100) NOT NULL,
                "slug" character varying(100) NOT NULL,
                "description" character varying(255),
                "status" character varying(20) NOT NULL DEFAULT 'active',
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_placements" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_placements_slug" UNIQUE ("slug"),
                CONSTRAINT "CHK_placements_status" CHECK ("status" IN ('active', 'inactive'))
            )
        `);

        await queryRunner.query(`
            INSERT INTO "placements" ("name", "slug", "description") VALUES
                ('Mega Menu', 'mega-menu', 'Top navigation mega menu'),
                ('Category Grid', 'category-grid', 'Homepage horizontal category slider'),
                ('Homepage', 'homepage', 'Legacy /api/home/category/section picker - not managed from Arrangements')
        `);

        await queryRunner.query(`
            CREATE TABLE "placement_items" (
                "id" SERIAL NOT NULL,
                "placementId" integer NOT NULL,
                "entityType" character varying(20) NOT NULL,
                "entityId" integer NOT NULL,
                "displayOrder" integer NOT NULL DEFAULT 0,
                "visible" boolean NOT NULL DEFAULT true,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_placement_items" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_placement_items_entity" UNIQUE ("placementId", "entityType", "entityId"),
                CONSTRAINT "CHK_placement_items_entity_type" CHECK ("entityType" IN ('category', 'subcategory'))
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "placement_items" ADD CONSTRAINT "FK_placement_items_placement"
            FOREIGN KEY ("placementId") REFERENCES "placements"("id") ON DELETE CASCADE ON UPDATE CASCADE
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_placement_items_order"
            ON "placement_items" ("placementId", "entityType", "displayOrder")
        `);

        // Backfill: Mega Menu gets every category plus every subcategory, both
        // ordered by their existing id (a reasonable proxy for "current order"
        // since neither table carries its own ordering column).
        await queryRunner.query(`
            INSERT INTO "placement_items" ("placementId", "entityType", "entityId", "displayOrder", "visible")
            SELECT p."id", 'category', c."id", (ROW_NUMBER() OVER (ORDER BY c."id") - 1)::int, true
            FROM "category" c, "placements" p
            WHERE p."slug" = 'mega-menu'
        `);
        await queryRunner.query(`
            INSERT INTO "placement_items" ("placementId", "entityType", "entityId", "displayOrder", "visible")
            SELECT p."id", 'subcategory', sc."id",
                   (ROW_NUMBER() OVER (PARTITION BY sc."categoryId" ORDER BY sc."id") - 1)::int, true
            FROM "subcategory" sc, "placements" p
            WHERE p."slug" = 'mega-menu'
        `);

        // Category Grid gets every subcategory, flat, ordered by id.
        await queryRunner.query(`
            INSERT INTO "placement_items" ("placementId", "entityType", "entityId", "displayOrder", "visible")
            SELECT p."id", 'subcategory', sc."id", (ROW_NUMBER() OVER (ORDER BY sc."id") - 1)::int, true
            FROM "subcategory" sc, "placements" p
            WHERE p."slug" = 'category-grid'
        `);

        // Homepage backfill: the homecategory table is the pre-existing
        // proto-placement this endpoint used before merchandising existed.
        // Its rows become placement_items rows, ordered by insertion id.
        await queryRunner.query(`
            INSERT INTO "placement_items" ("placementId", "entityType", "entityId", "displayOrder", "visible")
            SELECT p."id", 'category', hc."categoryId", (ROW_NUMBER() OVER (ORDER BY hc."id") - 1)::int, true
            FROM "homecategory" hc, "placements" p
            WHERE p."slug" = 'homepage' AND hc."categoryId" IS NOT NULL
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS "placement_items"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "placements"`);
    }
}
