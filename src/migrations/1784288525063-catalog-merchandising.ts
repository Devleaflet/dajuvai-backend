import { MigrationInterface, QueryRunner } from "typeorm";

export class CatalogMerchandising1784288525063 implements MigrationInterface {
    name = 'CatalogMerchandising1784288525063'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE "placement" (
                "code" character varying(64) NOT NULL,
                "label" character varying(128) NOT NULL,
                "isActive" boolean NOT NULL DEFAULT true,
                "sortOrder" integer NOT NULL DEFAULT 0,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_placement" PRIMARY KEY ("code")
            )
        `);

        await queryRunner.query(`
            INSERT INTO "placement" ("code", "label", "sortOrder") VALUES
                ('MEGA_MENU', 'Mega Menu', 1),
                ('HOMEPAGE', 'Homepage', 2),
                ('MOBILE', 'Mobile', 3),
                ('SEARCH', 'Search', 4),
                ('CATEGORY_GRID', 'Category Grid', 5),
                ('FEATURED', 'Featured', 6),
                ('DEALS', 'Deals', 7)
        `);

        await queryRunner.query(`
            CREATE TABLE "category_placement" (
                "id" SERIAL NOT NULL,
                "categoryId" integer NOT NULL,
                "placementCode" character varying(64) NOT NULL,
                "displayOrder" integer NOT NULL DEFAULT 0,
                "visible" boolean NOT NULL DEFAULT true,
                "featured" boolean NOT NULL DEFAULT false,
                "pinned" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_category_placement" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_category_placement" UNIQUE ("categoryId", "placementCode")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "category_placement" ADD CONSTRAINT "FK_category_placement_category"
            FOREIGN KEY ("categoryId") REFERENCES "category"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "category_placement" ADD CONSTRAINT "FK_category_placement_placement"
            FOREIGN KEY ("placementCode") REFERENCES "placement"("code") ON DELETE CASCADE ON UPDATE CASCADE
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_category_placement_read"
            ON "category_placement" ("placementCode", "pinned", "displayOrder")
        `);

        await queryRunner.query(`
            CREATE TABLE "subcategory_placement" (
                "id" SERIAL NOT NULL,
                "subcategoryId" integer NOT NULL,
                "placementCode" character varying(64) NOT NULL,
                "displayOrder" integer NOT NULL DEFAULT 0,
                "visible" boolean NOT NULL DEFAULT true,
                "featured" boolean NOT NULL DEFAULT false,
                "pinned" boolean NOT NULL DEFAULT false,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_subcategory_placement" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_subcategory_placement" UNIQUE ("subcategoryId", "placementCode")
            )
        `);
        await queryRunner.query(`
            ALTER TABLE "subcategory_placement" ADD CONSTRAINT "FK_subcategory_placement_subcategory"
            FOREIGN KEY ("subcategoryId") REFERENCES "subcategory"("id") ON DELETE CASCADE ON UPDATE NO ACTION
        `);
        await queryRunner.query(`
            ALTER TABLE "subcategory_placement" ADD CONSTRAINT "FK_subcategory_placement_placement"
            FOREIGN KEY ("placementCode") REFERENCES "placement"("code") ON DELETE CASCADE ON UPDATE CASCADE
        `);
        await queryRunner.query(`
            CREATE INDEX "IDX_subcategory_placement_read"
            ON "subcategory_placement" ("placementCode", "pinned", "displayOrder")
        `);

        // Backfill: the homecategory table is the homepage-only proto-placement.
        // Its rows become HOMEPAGE placement rows, ordered by insertion id.
        await queryRunner.query(`
            INSERT INTO "category_placement" ("categoryId", "placementCode", "displayOrder", "visible")
            SELECT hc."categoryId", 'HOMEPAGE', (ROW_NUMBER() OVER (ORDER BY hc."id") - 1)::int, true
            FROM "homecategory" hc
            WHERE hc."categoryId" IS NOT NULL
            ON CONFLICT ("categoryId", "placementCode") DO NOTHING
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // homecategory is never dropped by up(), so down() is lossless.
        await queryRunner.query(`DROP TABLE "subcategory_placement"`);
        await queryRunner.query(`DROP TABLE "category_placement"`);
        await queryRunner.query(`DROP TABLE "placement"`);
    }
}
