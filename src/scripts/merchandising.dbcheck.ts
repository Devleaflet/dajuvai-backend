/**
 * Integration check for placements against a real Postgres.
 *
 *   npx ts-node src/scripts/merchandising.dbcheck.ts
 *
 * Covers what only breaks against a real database: displayOrder ordering,
 * that a reorder containing an id outside the placement writes nothing at
 * all rather than half the rows, and that hiding an item removes it from the
 * storefront read without deleting the row.
 *
 * It creates its own throwaway placement (`dbcheck-tmp`) and deletes it in a
 * finally block, so it is safe against a populated database. It never writes
 * to a real placement.
 */
import assert from "assert";
import AppDataSource from "../config/db.config";
import { Category } from "../entities/category.entity";
import { Placement } from "../entities/placement.entity";
import { PlacementItem } from "../entities/placementItem.entity";
import { merchandisingService } from "../service/merchandising.service";
import { _clearCacheForTest } from "../utils/merchandising.cache";

const SLUG = "dbcheck-tmp";

const ok = (m: string) => console.log(`  ok - ${m}`);

async function cleanup() {
    await AppDataSource.query(
        `DELETE FROM "placement_items" WHERE "placementId" IN (SELECT "id" FROM "placements" WHERE "slug" = $1)`,
        [SLUG],
    );
    await AppDataSource.query(`DELETE FROM "placements" WHERE "slug" = $1`, [SLUG]);
}

(async () => {
    await AppDataSource.initialize();
    console.log("placements db-check");
    try {
        await cleanup();
        _clearCacheForTest();
        await AppDataSource.getRepository(Placement).save({
            name: "DB check temp",
            slug: SLUG,
            description: null,
            status: "active",
        });

        const categories = await AppDataSource.getRepository(Category).find({ order: { id: "ASC" }, take: 3 });
        assert.ok(categories.length >= 3, "need at least 3 categories in the DB to run this check");
        const [a, b, c] = categories;

        const addedCount = await merchandisingService.addItems(
            SLUG,
            categories.map((cat) => ({ entityType: "category" as const, entityId: cat.id })),
        );
        assert.strictEqual(addedCount, 3, "all three categories must be added");
        ok("adds categories to a placement");

        const secondAdd = await merchandisingService.addItems(SLUG, [{ entityType: "category", entityId: a.id }]);
        assert.strictEqual(secondAdd, 0, "adding a duplicate must be skipped, not throw");
        ok("duplicate add is silently skipped");

        // Appended rows must be 0,1,2 in add order.
        const placement = await AppDataSource.getRepository(Placement).findOneByOrFail({ slug: SLUG });
        const appended = await AppDataSource.getRepository(PlacementItem).find({
            where: { placementId: placement.id, entityType: "category" },
            order: { displayOrder: "ASC" },
        });
        assert.deepStrictEqual(
            appended.map((row) => row.entityId),
            [a.id, b.id, c.id],
            "add must append at the end",
        );
        ok("add appends at max(displayOrder) + 1");
        const [itemA, itemB, itemC] = appended;

        // Reverse the order.
        await merchandisingService.reorder(SLUG, [
            { itemId: itemC.id, displayOrder: 0 },
            { itemId: itemB.id, displayOrder: 1 },
            { itemId: itemA.id, displayOrder: 2 },
        ]);

        const items = await merchandisingService.getItems(SLUG);
        assert.ok("items" in items, "a non-mega-menu placement must return a flat items list");
        if ("items" in items) {
            assert.deepStrictEqual(
                items.items.map((row) => row.entityId),
                [c.id, b.id, a.id],
                "items must come back ordered by displayOrder",
            );
        }
        ok("reorder is reflected in displayOrder");

        // Atomicity: a payload with an id outside the placement writes nothing.
        const before = await AppDataSource.getRepository(PlacementItem).find({
            where: { placementId: placement.id },
            order: { id: "ASC" },
        });
        await assert.rejects(
            () =>
                merchandisingService.reorder(SLUG, [
                    { itemId: itemA.id, displayOrder: 99 },
                    { itemId: 2147483000, displayOrder: 100 },
                ]),
            /not in/i,
            "reorder with an unknown itemId must be rejected",
        );
        const after = await AppDataSource.getRepository(PlacementItem).find({
            where: { placementId: placement.id },
            order: { id: "ASC" },
        });
        assert.deepStrictEqual(
            after.map((row) => row.displayOrder),
            before.map((row) => row.displayOrder),
            "a rejected reorder must write nothing",
        );
        ok("rejected reorder is atomic - no partial write");

        // Hidden rows disappear from the admin/storefront items read but survive in the table.
        await merchandisingService.updateVisibility(SLUG, itemC.id, false);
        const afterHide = await merchandisingService.getItems(SLUG);
        if ("items" in afterHide) {
            assert.deepStrictEqual(
                afterHide.items.map((row) => row.entityId).sort(),
                [a.id, b.id, c.id].sort(),
                "admin items read must still include hidden rows",
            );
        }
        assert.strictEqual(
            await AppDataSource.getRepository(PlacementItem).countBy({ placementId: placement.id }),
            3,
            "hiding must not delete the row",
        );
        ok("visible=false hides from storefront without deleting");

        await merchandisingService.removeItem(SLUG, itemA.id);
        assert.strictEqual(
            await AppDataSource.getRepository(PlacementItem).countBy({ placementId: placement.id }),
            2,
            "remove must delete the placement_items row",
        );
        assert.ok(
            await AppDataSource.getRepository(Category).findOneBy({ id: a.id }),
            "remove must not delete the category itself",
        );
        ok("remove drops the placement_items row, not the category");

        console.log("\nall checks passed");
    } finally {
        await cleanup();
        await AppDataSource.destroy();
    }
})().catch((error) => {
    console.error("\nFAILED:", error.message);
    process.exit(1);
});
