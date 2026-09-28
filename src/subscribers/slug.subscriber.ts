import {
    EntityManager,
    EntitySubscriberInterface,
    EventSubscriber,
    InsertEvent,
    UpdateEvent,
} from "typeorm";
import { baseSlug, nextFreeSlug, slugMatchesBase } from "../utils/slug.util";

type SluggedRow = Record<string, unknown> & { id?: number; slug?: string | null };

interface SlugSource {
    /** Stable key stored in `slug_redirects.entityType`. */
    entityType: string;
    /** Used when the name yields no Latin characters, and to prefix all-digit slugs. */
    fallback: string;
    /** The text the slug is derived from. */
    source: (row: SluggedRow) => string | null | undefined;
    /** Columns whose change should re-derive the slug. */
    watch: string[];
}

const byName = (row: SluggedRow) => row.name as string | undefined;

/** Keyed by table name. Adding a table here is all it takes to give it slugs — plus the column and a backfill. */
export const SLUGGED_TABLES: Record<string, SlugSource> = {
    products: { entityType: "product", fallback: "product", source: byName, watch: ["name"] },
    vendor: {
        entityType: "vendor",
        fallback: "store",
        source: (row) => row.businessName as string | undefined,
        watch: ["businessName"],
    },
    category: { entityType: "category", fallback: "category", source: byName, watch: ["name"] },
    subcategory: { entityType: "subcategory", fallback: "subcategory", source: byName, watch: ["name"] },
    brands: { entityType: "brand", fallback: "brand", source: byName, watch: ["name"] },
    deals: { entityType: "deal", fallback: "deal", source: byName, watch: ["name"] },
    banners: { entityType: "banner", fallback: "banner", source: byName, watch: ["name"] },
    homepage_section: {
        entityType: "homepage_section",
        fallback: "section",
        source: (row) => row.title as string | undefined,
        watch: ["title"],
    },
    user: {
        entityType: "user",
        fallback: "user",
        source: (row) =>
            (row.fullName as string | undefined)?.trim() ||
            (row.username as string | undefined)?.trim() ||
            (row.email as string | undefined)?.split("@")[0],
        watch: ["fullName", "username", "email"],
    },
};

/**
 * Returns a slug for `source` that no other row of `table` holds and that no
 * other row used to hold.
 *
 * The advisory lock serialises allocation of the same base inside concurrent
 * transactions: without it two "Red Kurta" products saved at once both see
 * `red-kurta` free, and one insert dies on the unique index. The lock is
 * transaction-scoped, so it is released at commit alongside the new row
 * becoming visible to the next waiter.
 */
export async function allocateSlug(
    manager: EntityManager,
    table: string,
    base: string,
    excludeId?: number,
): Promise<string> {
    const { entityType } = SLUGGED_TABLES[table];
    await manager.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`slug:${table}:${base}`]);

    const pattern = `^${base}-[0-9]+$`;
    const rows: { slug: string }[] = await manager.query(
        `SELECT slug FROM "${table}" WHERE (slug = $1 OR slug ~ $2) AND id <> $3
         UNION
         SELECT slug FROM slug_redirects
          WHERE "entityType" = $4 AND "entityId" <> $3 AND (slug = $1 OR slug ~ $2)`,
        [base, pattern, excludeId ?? -1, entityType],
    );
    return nextFreeSlug(base, rows.map((r) => r.slug));
}

/**
 * Keeps the `slug` column of every table in `SLUGGED_TABLES` in step with the
 * record's name, on every `save()` path.
 *
 * - Insert: always assigned; a client-supplied slug is ignored.
 * - Update: re-derived only when a watched column changed *and* the current
 *   slug no longer describes the name, so a whitespace or casing edit keeps
 *   the URL. The old slug goes to `slug_redirects`.
 *
 * `QueryBuilder.update()` / `repository.update()` carry no loaded row, so a
 * rename through them keeps the old (still valid, still unique) slug.
 */
@EventSubscriber()
export class SlugSubscriber implements EntitySubscriberInterface {
    async beforeInsert(event: InsertEvent<SluggedRow>): Promise<void> {
        const config = SLUGGED_TABLES[event.metadata.tableName];
        if (!config || !event.entity) return;

        const base = baseSlug(config.source(event.entity), config.fallback);
        event.entity.slug = await allocateSlug(event.manager, event.metadata.tableName, base);
    }

    async beforeUpdate(event: UpdateEvent<SluggedRow>): Promise<void> {
        const config = SLUGGED_TABLES[event.metadata.tableName];
        const current = event.databaseEntity as SluggedRow | undefined;
        const next = event.entity as SluggedRow | undefined;
        if (!config || !current?.id || !next) return;

        const merged = { ...current, ...next };
        const base = baseSlug(config.source(merged), config.fallback);
        if (slugMatchesBase(current.slug, base)) {
            // Name unchanged in substance. Never let a caller overwrite the slug directly.
            if (next.slug !== undefined) next.slug = current.slug;
            return;
        }

        const slug = await allocateSlug(event.manager, event.metadata.tableName, base, current.id);
        next.slug = slug;

        if (current.slug) {
            await event.manager.query(
                `INSERT INTO slug_redirects ("entityType", slug, "entityId") VALUES ($1, $2, $3)
                 ON CONFLICT ("entityType", slug) DO UPDATE SET "entityId" = EXCLUDED."entityId"`,
                [config.entityType, current.slug, current.id],
            );
        }
        // Renaming back to an old name reclaims its slug; drop the redirect that now points at itself.
        await event.manager.query(
            `DELETE FROM slug_redirects WHERE "entityType" = $1 AND slug = $2`,
            [config.entityType, slug],
        );
    }
}
