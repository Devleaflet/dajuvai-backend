/**
 * Integration check for merchandising against a real Postgres.
 *
 *   npx ts-node src/scripts/merchandising.dbcheck.ts
 *
 * Covers what only breaks against a real database: that the SQL ORDER BY agrees
 * with the JS sort contract, and that a reorder containing an id outside the
 * placement writes nothing at all rather than half the rows.
 *
 * It creates its own throwaway placement (`DBCHECK_TMP`) and deletes it in a
 * finally block, so it is safe against a populated database. It never writes to
 * a real placement.
 */
import assert from "assert";
import AppDataSource from "../config/db.config";
import { Category } from "../entities/category.entity";
import { Placement } from "../entities/placement.entity";
import { CategoryPlacement } from "../entities/categoryPlacement.entity";
import { merchandisingService } from "../service/merchandising.service";
import { sortPlacementRows } from "../utils/merchandising.sort";

const CODE = "DBCHECK_TMP";

const ok = (m: string) => console.log(`  ok - ${m}`);

async function cleanup() {
    await AppDataSource.query(`DELETE FROM category_placement WHERE "placementCode" = $1`, [CODE]);
    await AppDataSource.query(`DELETE FROM placement WHERE "code" = $1`, [CODE]);
}

(async () => {
    await AppDataSource.initialize();
    console.log("merchandising db-check");
    try {
        await cleanup();
        await AppDataSource.getRepository(Placement).save({
            code: CODE,
            label: "DB check temp",
            isActive: true,
            sortOrder: 999,
        });

        const categories = await AppDataSource.getRepository(Category).find({
            order: { id: "ASC" },
            take: 3,
        });
        assert.ok(categories.length >= 3, "need at least 3 categories in the DB to run this check");
        const [a, b, c] = categories;

        for (const category of categories) {
            await merchandisingService.addToPlacement("category", CODE, category.id);
        }
        ok("adds categories to a placement");

        // Appended rows must be 0,1,2 in add order.
        const appended = await AppDataSource.getRepository(CategoryPlacement).find({
            where: { placementCode: CODE },
            order: { displayOrder: "ASC" },
        });
        assert.deepStrictEqual(
            appended.map((row) => row.categoryId),
            [a.id, b.id, c.id],
            "add must append at the end",
        );
        ok("add appends at max(displayOrder) + 1");

        await assert.rejects(
            () => merchandisingService.addToPlacement("category", CODE, a.id),
            /already in/i,
            "adding a duplicate must raise ConflictError",
        );
        ok("duplicate add is rejected");

        // Reverse the order, pin the last one.
        await merchandisingService.reorder("category", CODE, [
            { targetId: c.id, displayOrder: 0 },
            { targetId: b.id, displayOrder: 1 },
            { targetId: a.id, displayOrder: 2 },
        ]);
        await merchandisingService.updateConfig("category", CODE, a.id, { pinned: true });

        const publicRows = await merchandisingService.getPublicCategories(CODE);
        assert.deepStrictEqual(
            publicRows.map((row) => row.categoryId),
            [a.id, c.id, b.id],
            "SQL order must be pinned DESC, displayOrder ASC, id ASC",
        );
        ok("SQL read order matches the sort contract");

        // The JS comparator must agree with what SQL just returned.
        const raw = await AppDataSource.getRepository(CategoryPlacement).find({
            where: { placementCode: CODE },
        });
        assert.deepStrictEqual(
            sortPlacementRows(raw).map((row) => row.categoryId),
            publicRows.map((row) => row.categoryId),
            "JS sort and SQL order must agree",
        );
        ok("JS comparator agrees with SQL");

        // Hidden rows disappear from public reads but survive in the table.
        await merchandisingService.updateConfig("category", CODE, c.id, { visible: false });
        const afterHide = await merchandisingService.getPublicCategories(CODE);
        assert.deepStrictEqual(
            afterHide.map((row) => row.categoryId),
            [a.id, b.id],
            "hidden rows must not appear in public reads",
        );
        assert.strictEqual(
            await AppDataSource.getRepository(CategoryPlacement).countBy({ placementCode: CODE }),
            3,
            "hiding must not delete the row",
        );
        ok("visible=false hides without deleting");

        // Atomicity: a payload with an id outside the placement writes nothing.
        const before = await AppDataSource.getRepository(CategoryPlacement).find({
            where: { placementCode: CODE },
            order: { id: "ASC" },
        });
        await assert.rejects(
            () => merchandisingService.reorder("category", CODE, [
                { targetId: a.id, displayOrder: 99 },
                { targetId: 2147483000, displayOrder: 100 },
            ]),
            /not in/i,
            "reorder with an unknown id must be rejected",
        );
        const after = await AppDataSource.getRepository(CategoryPlacement).find({
            where: { placementCode: CODE },
            order: { id: "ASC" },
        });
        assert.deepStrictEqual(
            after.map((row) => row.displayOrder),
            before.map((row) => row.displayOrder),
            "a rejected reorder must write nothing",
        );
        ok("rejected reorder is atomic - no partial write");

        // The admin list shows every category, assigned or not.
        const adminRows = await merchandisingService.getAdminCategories(CODE);
        const total = await AppDataSource.getRepository(Category).count();
        assert.strictEqual(adminRows.length, total, "admin list must include unassigned categories");
        assert.strictEqual(
            adminRows.filter((row) => row.inPlacement).length,
            3,
            "admin list must mark exactly the assigned rows",
        );
        assert.ok(
            adminRows.slice(0, 3).every((row) => row.inPlacement),
            "assigned rows must come before unassigned",
        );
        ok("admin list merges assigned and unassigned");

        await merchandisingService.removeFromPlacement("category", CODE, a.id);
        assert.strictEqual(
            await AppDataSource.getRepository(CategoryPlacement).countBy({ placementCode: CODE }),
            2,
            "remove must delete the placement row",
        );
        assert.ok(
            await AppDataSource.getRepository(Category).findOneBy({ id: a.id }),
            "remove must not delete the category itself",
        );
        ok("remove drops the placement row, not the category");

        console.log("\nall checks passed");
    } finally {
        await cleanup();
        await AppDataSource.destroy();
    }
})().catch((error) => {
    console.error("\nFAILED:", error.message);
    process.exit(1);
});
