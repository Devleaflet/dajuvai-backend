/**
 * Self-check for the merchandising sort contract and request schemas.
 * No DB, no test framework.
 *
 *   npx ts-node src/scripts/merchandising.selfcheck.ts
 *
 * The sort contract (pinned DESC, displayOrder ASC, id ASC) is duplicated in
 * SQL (public reads) and in JS (the admin merged list). This checks the JS half
 * — merchandising.dbcheck.ts checks that SQL agrees.
 */
import assert from "assert";
import { sortPlacementRows } from "../utils/merchandising.sort";
import {
    reorderCategoriesSchema,
    updatePlacementConfigSchema,
    placementCodeSchema,
} from "../utils/zod_validations/merchandising.zod";

const ok = (name: string) => console.log(`  ok - ${name}`);

function checkSortContract() {
    const rows = [
        { id: 4, displayOrder: 2, pinned: false },
        { id: 1, displayOrder: 5, pinned: true },
        { id: 3, displayOrder: 1, pinned: false },
        { id: 2, displayOrder: 5, pinned: true },
    ];
    const sorted = sortPlacementRows(rows);

    assert.deepStrictEqual(
        sorted.map((r) => r.id),
        [1, 2, 3, 4],
        "pinned rows must precede unpinned regardless of displayOrder",
    );
    ok("pinned rows float above unpinned");

    const byOrder = sortPlacementRows([
        { id: 9, displayOrder: 3, pinned: false },
        { id: 8, displayOrder: 0, pinned: false },
    ]);
    assert.deepStrictEqual(byOrder.map((r) => r.id), [8, 9], "displayOrder must sort ascending");
    ok("displayOrder sorts ascending within a group");

    // Equal displayOrder is common right after a bulk insert; without the id
    // tiebreak the order would be nondeterministic between requests.
    const tie = sortPlacementRows([
        { id: 7, displayOrder: 1, pinned: false },
        { id: 2, displayOrder: 1, pinned: false },
    ]);
    assert.deepStrictEqual(tie.map((r) => r.id), [2, 7], "equal displayOrder must break by id");
    ok("equal displayOrder breaks by id ascending");

    const input = [{ id: 1, displayOrder: 0, pinned: false }];
    const result = sortPlacementRows(input);
    assert.notStrictEqual(result, input, "sortPlacementRows must not mutate its argument");
    ok("sortPlacementRows returns a new array");
}

function checkSchemas() {
    assert.strictEqual(placementCodeSchema.parse("MEGA_MENU"), "MEGA_MENU");
    assert.throws(() => placementCodeSchema.parse("mega menu"), "lowercase/spaces must be rejected");
    ok("placement code accepts SCREAMING_SNAKE only");

    const reorder = reorderCategoriesSchema.parse([
        { categoryId: "3", displayOrder: "0" },
        { categoryId: 5, displayOrder: 1 },
    ]);
    assert.deepStrictEqual(reorder, [
        { categoryId: 3, displayOrder: 0 },
        { categoryId: 5, displayOrder: 1 },
    ], "reorder payload must coerce string ids");
    ok("reorder coerces string ids to numbers");

    assert.throws(
        () => reorderCategoriesSchema.parse([
            { categoryId: 3, displayOrder: 0 },
            { categoryId: 3, displayOrder: 1 },
        ]),
        "duplicate categoryId must be rejected",
    );
    ok("reorder rejects duplicate ids");

    assert.throws(() => reorderCategoriesSchema.parse([]), "empty reorder payload must be rejected");
    ok("reorder rejects an empty payload");

    assert.deepStrictEqual(
        updatePlacementConfigSchema.parse({ visible: false }),
        { visible: false },
    );
    assert.throws(() => updatePlacementConfigSchema.parse({}), "empty patch must be rejected");
    ok("config patch requires at least one field");
}

(async () => {
    console.log("merchandising self-check");
    checkSortContract();
    checkSchemas();
    console.log("\nall checks passed");
})().catch((error) => {
    console.error("\nFAILED:", error.message);
    process.exit(1);
});
