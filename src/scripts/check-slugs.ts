/**
 * End-to-end check of URL slug assignment against a real, migrated database.
 *
 * What it exercises is the database half that unit tests cannot reach: the
 * unique index, the advisory lock that serialises concurrent allocation, and
 * `slug_redirects`. It works on the `brands` table (no routes, nothing
 * references it) and deletes every row it creates. Exits non-zero on failure.
 *
 *   npm run check:slugs
 */
import "reflect-metadata";
import AppDataSource from "../config/db.config";
import { Brand } from "../entities/brand.entity";
import { resolveEntityId } from "../middlewares/slug.middleware";

let failures = 0;
const check = (condition: unknown, label: string) => {
    console.log(`${condition ? "ok  " : "FAIL"} ${label}`);
    if (!condition) failures++;
};

async function main() {
    AppDataSource.setOptions({ migrations: [] });
    await AppDataSource.initialize();
    const repo = AppDataSource.getRepository(Brand);
    const slugOf = async (id: number) => (await repo.findOneBy({ id }))!.slug;
    const tag = `zz slug check ${Date.now()}`;

    try {
        const a = await repo.save(repo.create({ name: `${tag} Café Crème` }));
        const base = a.slug;
        check(/^zz-slug-check-\d+-cafe-creme$/.test(base), `assigned on insert: ${base}`);

        const b = await repo.save(repo.create({ name: `${tag} cafe creme` }));
        check(b.slug === `${base}-2`, `same base gets a suffix: ${b.slug}`);

        await repo.save(Object.assign(a, { slug: "chosen-by-client" }));
        check((await slugOf(a.id)) === base, "a client-supplied slug is ignored");

        a.name = `${tag} Cafe Creme  `;
        await repo.save(a);
        check((await slugOf(a.id)) === base, "a cosmetic rename keeps the slug");

        a.name = `${tag} Espresso Bar`;
        await repo.save(a);
        const renamed = await slugOf(a.id);
        check(renamed.endsWith("espresso-bar"), `a real rename moves the slug: ${renamed}`);
        check((await resolveEntityId("brands", base)) === a.id, "the old slug still resolves");

        const c = await repo.save(repo.create({ name: `${tag} CAFE-CREME` }));
        check(c.slug !== base, `a retired slug is never handed to another record: ${c.slug}`);

        a.name = `${tag} Café Crème!`;
        await repo.save(a);
        check((await slugOf(a.id)) === base, "renaming back reclaims the record's own old slug");

        const names = ["Rush", "rush", "RUSH", "Rush!", "Rush.", "rush?"];
        const saved = await Promise.all(
            names.map((n) =>
                AppDataSource.transaction((m) =>
                    m.getRepository(Brand).save(m.getRepository(Brand).create({ name: `${tag} ${n}` })),
                ),
            ),
        );
        check(new Set(saved.map((s) => s.slug)).size === names.length, "concurrent inserts get distinct slugs");
    } finally {
        const rows = await repo.createQueryBuilder("b").where("b.name LIKE :t", { t: `${tag}%` }).getMany();
        await AppDataSource.query(
            `DELETE FROM slug_redirects WHERE "entityType" = 'brand' AND "entityId" = ANY($1)`,
            [rows.map((r) => r.id)],
        );
        await repo.remove(rows);
        await AppDataSource.destroy();
    }

    if (failures) {
        console.error(`${failures} slug check(s) failed`);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
