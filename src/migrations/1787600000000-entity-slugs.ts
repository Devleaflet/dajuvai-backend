import { MigrationInterface, QueryRunner } from "typeorm";
import { SLUGGED_TABLES } from "../subscribers/slug.subscriber";
import { baseSlug, nextFreeSlug } from "../utils/slug.util";

/**
 * Human-readable URL slugs for every record that has a public or console page.
 *
 * Until now every link carried a database id (`/product-page/184`). Each table
 * in `SLUGGED_TABLES` gets a `slug` column, unique per table, derived from the
 * record's name by the same `baseSlug` the runtime `SlugSubscriber` uses — so
 * a backfilled slug and a freshly assigned one cannot disagree about format.
 *
 * Backfill order is by id, so where two records share a name the older one
 * keeps the bare slug and the newer one gets `-2`.
 *
 * `slug_redirects` holds slugs a record has since been renamed away from, so a
 * link shared before a rename still resolves.
 *
 * Numeric ids keep working everywhere: every `/:id` route now accepts an id or
 * a slug, which is what keeps the mobile app and existing links unaffected.
 */
export class EntitySlugs1787600000000 implements MigrationInterface {
    name = "EntitySlugs1787600000000";

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "slug_redirects" (
                "id" SERIAL PRIMARY KEY,
                "entityType" character varying(32) NOT NULL,
                "slug" character varying(128) NOT NULL,
                "entityId" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS "IDX_slug_redirects_type_slug"
            ON "slug_redirects" ("entityType", "slug")
        `);
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_slug_redirects_type_entity"
            ON "slug_redirects" ("entityType", "entityId")
        `);

        for (const [table, config] of Object.entries(SLUGGED_TABLES)) {
            await queryRunner.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "slug" character varying(128)`);

            const rows: Record<string, unknown>[] = await queryRunner.query(
                `SELECT * FROM "${table}" WHERE slug IS NULL ORDER BY id`,
            );
            const existing: { slug: string }[] = await queryRunner.query(
                `SELECT slug FROM "${table}" WHERE slug IS NOT NULL`,
            );
            const taken = new Set(existing.map((r) => r.slug));

            const ids: number[] = [];
            const slugs: string[] = [];
            for (const row of rows) {
                const slug = nextFreeSlug(baseSlug(config.source(row), config.fallback), taken);
                taken.add(slug);
                ids.push(row.id as number);
                slugs.push(slug);
            }

            if (ids.length) {
                await queryRunner.query(
                    `UPDATE "${table}" AS t SET slug = v.slug
                     FROM unnest($1::int[], $2::text[]) AS v(id, slug)
                     WHERE t.id = v.id`,
                    [ids, slugs],
                );
            }

            await queryRunner.query(`ALTER TABLE "${table}" ALTER COLUMN "slug" SET NOT NULL`);
            await queryRunner.query(
                `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_${table}_slug" ON "${table}" ("slug")`,
            );
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        for (const table of Object.keys(SLUGGED_TABLES)) {
            await queryRunner.query(`DROP INDEX IF EXISTS "UQ_${table}_slug"`);
            await queryRunner.query(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "slug"`);
        }
        await queryRunner.query(`DROP TABLE IF EXISTS "slug_redirects"`);
    }
}
