/**
 * Self-check for placement request schemas and the storefront cache.
 * No DB, no test framework.
 *
 *   npx ts-node src/scripts/merchandising.selfcheck.ts
 *
 * merchandising.dbcheck.ts covers what only breaks against a real database
 * (ordering, atomicity, visibility) - this covers the pure-JS contracts.
 */
import assert from "assert";
import {
    placementSlugSchema,
    addItemsSchema,
    updateVisibilitySchema,
    reorderSchema,
    availableItemsQuerySchema,
} from "../utils/zod_validations/merchandising.zod";
import { cacheGet, cacheSet, cacheInvalidate, _clearCacheForTest } from "../utils/merchandising.cache";

const ok = (name: string) => console.log(`  ok - ${name}`);

function checkSchemas() {
    assert.strictEqual(placementSlugSchema.parse("mega-menu"), "mega-menu");
    assert.throws(() => placementSlugSchema.parse("Mega Menu"), "spaces/uppercase must be rejected");
    assert.throws(() => placementSlugSchema.parse("mega--menu"), "double hyphen must be rejected");
    ok("placement slug accepts lower-kebab-case only");

    const added = addItemsSchema.parse({ items: [{ entityType: "subcategory", entityId: "22" }] });
    assert.deepStrictEqual(added, { items: [{ entityType: "subcategory", entityId: 22 }] });
    ok("addItems coerces string entityId to number");
    assert.throws(() => addItemsSchema.parse({ items: [] }), "empty items must be rejected");
    ok("addItems rejects an empty items array");
    assert.throws(
        () => addItemsSchema.parse({ items: [{ entityType: "product", entityId: 1 }] }),
        "unknown entityType must be rejected",
    );
    ok("addItems rejects an entityType outside category/subcategory");

    assert.deepStrictEqual(updateVisibilitySchema.parse({ visible: false }), { visible: false });
    assert.throws(() => updateVisibilitySchema.parse({}), "missing visible must be rejected");
    ok("updateVisibility requires the visible field");

    const reordered = reorderSchema.parse({
        items: [
            { itemId: "5", displayOrder: "0" },
            { itemId: 6, displayOrder: 1 },
        ],
    });
    assert.deepStrictEqual(reordered, {
        items: [
            { itemId: 5, displayOrder: 0 },
            { itemId: 6, displayOrder: 1 },
        ],
    });
    ok("reorder coerces string ids to numbers");
    assert.throws(
        () =>
            reorderSchema.parse({
                items: [
                    { itemId: 5, displayOrder: 0 },
                    { itemId: 5, displayOrder: 1 },
                ],
            }),
        "duplicate itemId must be rejected",
    );
    ok("reorder rejects duplicate itemIds");
    assert.throws(() => reorderSchema.parse({ items: [] }), "empty reorder payload must be rejected");
    ok("reorder rejects an empty items array");

    assert.deepStrictEqual(availableItemsQuerySchema.parse({}), {});
    assert.deepStrictEqual(availableItemsQuerySchema.parse({ categoryId: "5" }), { categoryId: 5 });
    ok("available-items query accepts an optional categoryId");
}

function checkCache() {
    _clearCacheForTest();

    assert.strictEqual(cacheGet("storefront:mega-menu"), undefined, "empty cache misses");
    ok("cache miss on unset key");

    cacheSet("storefront:mega-menu", { categories: [] });
    assert.deepStrictEqual(cacheGet("storefront:mega-menu"), { categories: [] });
    ok("cache hit returns the stored value");

    cacheInvalidate("storefront:mega-menu");
    assert.strictEqual(cacheGet("storefront:mega-menu"), undefined, "invalidate must clear the key");
    ok("invalidate clears the key");

    cacheSet("storefront:category-grid", { items: ["a"] });
    cacheInvalidate("storefront:mega-menu");
    assert.deepStrictEqual(
        cacheGet("storefront:category-grid"),
        { items: ["a"] },
        "invalidating one placement's cache must not touch another",
    );
    ok("invalidate only clears its own key");

    _clearCacheForTest();
}

(async () => {
    console.log("merchandising self-check");
    checkSchemas();
    checkCache();
    console.log("\nall checks passed");
})().catch((error) => {
    console.error("\nFAILED:", error.message);
    process.exit(1);
});
