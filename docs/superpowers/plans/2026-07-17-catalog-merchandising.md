# Catalog Merchandising Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate catalog (what exists) from merchandising (where it appears) so a category can sit in many surfaces with independent order, visibility, featured and pinned flags — configured from an admin page and consumed by the storefront.

**Architecture:** Three new tables — `placement` (a seeded lookup of surface codes), `category_placement` and `subcategory_placement` (per-surface config rows). `category` and `subcategory` are not modified. One `MerchandisingService` serves both targets. The legacy `/api/home/category/section` endpoint is re-backed by the HOMEPAGE placement so nothing breaks. The Vite admin gets a Merchandising page with move-up/down/top/bottom buttons. The Next.js storefront reads placements with a fallback to all categories.

**Tech Stack:** Express 5, TypeORM 0.3, Postgres, zod, ts-node. Admin: React 19 + Vite + React Query + axios. Storefront: Next.js + React Query + axios.

Spec: `dajuvai-backend/docs/superpowers/specs/2026-07-17-catalog-merchandising-design.md`

## Global Constraints

- Three separate git repos, three separate branches. Commit in the repo you are editing.
  - `dajuvai-backend` (branch `fcm_notification`) — API
  - `DajuVai_React/dajuvai-frontend` (branch `master`) — admin panel
  - `dajuvai-nextjs-frontend` (branch `main`) — customer storefront
- `category` and `subcategory` tables/entities MUST NOT be modified. Presentation data lives only in placement tables.
- Sort contract, everywhere, no exceptions: `pinned DESC, displayOrder ASC, id ASC`.
- Placements are DB rows, never a TypeScript enum. Adding `BLACK_FRIDAY` must be an INSERT.
- No `startDate` / `endDate` columns. Scheduling is Phase 3 and is out of scope.
- Reordering uses move buttons. No drag-and-drop library may be added.
- Permissions: `isAdmin` for add/remove to a placement; `isAdminOrStaff` for reorder and visible/featured/pinned toggles.
- Backend has no test framework. Checks follow the existing convention: `src/scripts/*.selfcheck.ts` (pure, no DB) and `src/scripts/*.dbcheck.ts` (real Postgres, cleans up after itself), wired as `npm run check:*`.
- Storefront placement reads fall back to `GET /api/categories` when a placement is empty or errors.

---

## File Structure

**`dajuvai-backend`**

| File | Responsibility |
|---|---|
| Create `src/entities/placement.entity.ts` | `Placement` lookup entity |
| Create `src/entities/categoryPlacement.entity.ts` | `CategoryPlacement` config row |
| Create `src/entities/subcategoryPlacement.entity.ts` | `SubcategoryPlacement` config row |
| Create `src/migrations/1784288525063-catalog-merchandising.ts` | Tables, seed, HomeCategory backfill |
| Modify `src/config/db.config.ts` | Register the three entities |
| Create `src/utils/merchandising.sort.ts` | Pure sort contract comparator |
| Create `src/utils/zod_validations/merchandising.zod.ts` | Request schemas |
| Create `src/service/merchandising.service.ts` | All merchandising reads/writes, both targets |
| Create `src/controllers/merchandising.controller.ts` | HTTP layer |
| Create `src/routes/merchandising.routes.ts` | Public `/api/placements` |
| Create `src/routes/admin/merchandising.admin.routes.ts` | Admin `/api/admin/placements` |
| Modify `src/index.ts` | Mount both routers |
| Modify `src/service/home.category.service.ts` | Adapter over MerchandisingService |
| Create `src/scripts/merchandising.selfcheck.ts` | Pure checks |
| Create `src/scripts/merchandising.dbcheck.ts` | DB checks |
| Modify `package.json` | `check:merch`, `check:merch:db` scripts |

**`DajuVai_React/dajuvai-frontend`** (admin)

| File | Responsibility |
|---|---|
| Create `src/api/merchandising.ts` | Typed client for the merchandising API |
| Create `src/Pages/AdminMerchandising.tsx` | The Merchandising page |
| Create `src/Styles/AdminMerchandising.css` | Page styles |
| Modify `src/App.tsx` | `/admin-merchandising` route |
| Modify `src/Components/AdminSidebar.tsx` | Sidebar link |

**`dajuvai-nextjs-frontend`** (storefront)

| File | Responsibility |
|---|---|
| Create `lib/api/placements.ts` | Placement fetch + fallback |
| Modify `lib/api/categoryCatalog.ts` | HOMEPAGE placement source |
| Modify `components/Components/Navbar.tsx` | MEGA_MENU source |
| Modify `components/Components/CategorySlider.tsx` | CATEGORY_GRID source |

---

## Task 1: Placement entities, migration, backfill

**Files:**
- Create: `dajuvai-backend/src/entities/placement.entity.ts`
- Create: `dajuvai-backend/src/entities/categoryPlacement.entity.ts`
- Create: `dajuvai-backend/src/entities/subcategoryPlacement.entity.ts`
- Create: `dajuvai-backend/src/migrations/1784288525063-catalog-merchandising.ts`
- Modify: `dajuvai-backend/src/config/db.config.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `Placement { code, label, isActive, sortOrder, createdAt, updatedAt }`,
  `CategoryPlacement { id, categoryId, category, placementCode, placement, displayOrder, visible, featured, pinned, createdAt, updatedAt }`,
  `SubcategoryPlacement { id, subcategoryId, subcategory, placementCode, placement, displayOrder, visible, featured, pinned, createdAt, updatedAt }`.
  Table names: `placement`, `category_placement`, `subcategory_placement`.

- [ ] **Step 1: Create the Placement entity**

`src/entities/placement.entity.ts`:

```ts
import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from "typeorm";

/**
 * A surface where catalog items can be shown (mega menu, homepage, …).
 *
 * Deliberately a table and not a TS enum: a new placement must be an INSERT,
 * never a deploy. The primary key IS the code, so placement rows reference a
 * readable string rather than an opaque id.
 */
@Entity("placement")
export class Placement {
    @PrimaryColumn({ type: "varchar", length: 64 })
    code: string;

    @Column({ type: "varchar", length: 128 })
    label: string;

    @Column({ type: "boolean", default: true })
    isActive: boolean;

    @Column({ type: "int", default: 0 })
    sortOrder: number;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
```

- [ ] **Step 2: Create the CategoryPlacement entity**

`src/entities/categoryPlacement.entity.ts`:

```ts
import {
    Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
    Index, Unique, CreateDateColumn, UpdateDateColumn,
} from "typeorm";
import { Category } from "./category.entity";
import { Placement } from "./placement.entity";

/**
 * Where and how one category appears in one placement. All presentation state
 * lives here so the Category table stays a pure catalog record.
 */
@Entity("category_placement")
@Unique("UQ_category_placement", ["categoryId", "placementCode"])
@Index("IDX_category_placement_read", ["placementCode", "pinned", "displayOrder"])
export class CategoryPlacement {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    categoryId: number;

    @ManyToOne(() => Category, { onDelete: "CASCADE" })
    @JoinColumn({ name: "categoryId" })
    category: Category;

    @Column({ type: "varchar", length: 64 })
    placementCode: string;

    @ManyToOne(() => Placement, { onDelete: "CASCADE" })
    @JoinColumn({ name: "placementCode", referencedColumnName: "code" })
    placement: Placement;

    @Column({ type: "int", default: 0 })
    displayOrder: number;

    @Column({ type: "boolean", default: true })
    visible: boolean;

    /** Affects design (large card), not order. */
    @Column({ type: "boolean", default: false })
    featured: boolean;

    /** Affects order (floats above unpinned), not design. */
    @Column({ type: "boolean", default: false })
    pinned: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
```

- [ ] **Step 3: Create the SubcategoryPlacement entity**

`src/entities/subcategoryPlacement.entity.ts`:

```ts
import {
    Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn,
    Index, Unique, CreateDateColumn, UpdateDateColumn,
} from "typeorm";
import { Subcategory } from "./subcategory.entity";
import { Placement } from "./placement.entity";

/** Where and how one subcategory appears in one placement. */
@Entity("subcategory_placement")
@Unique("UQ_subcategory_placement", ["subcategoryId", "placementCode"])
@Index("IDX_subcategory_placement_read", ["placementCode", "pinned", "displayOrder"])
export class SubcategoryPlacement {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    subcategoryId: number;

    @ManyToOne(() => Subcategory, { onDelete: "CASCADE" })
    @JoinColumn({ name: "subcategoryId" })
    subcategory: Subcategory;

    @Column({ type: "varchar", length: 64 })
    placementCode: string;

    @ManyToOne(() => Placement, { onDelete: "CASCADE" })
    @JoinColumn({ name: "placementCode", referencedColumnName: "code" })
    placement: Placement;

    @Column({ type: "int", default: 0 })
    displayOrder: number;

    @Column({ type: "boolean", default: true })
    visible: boolean;

    @Column({ type: "boolean", default: false })
    featured: boolean;

    @Column({ type: "boolean", default: false })
    pinned: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
```

- [ ] **Step 4: Register the entities in the data source**

In `src/config/db.config.ts`, add to the imports (after the `NotificationDispatch` import):

```ts
import { Placement } from "../entities/placement.entity";
import { CategoryPlacement } from "../entities/categoryPlacement.entity";
import { SubcategoryPlacement } from "../entities/subcategoryPlacement.entity";
```

and add to the **active** `entities: [...]` array (the second one — the first is commented out) after `NotificationDispatch,`:

```ts
        Placement,
        CategoryPlacement,
        SubcategoryPlacement,
```

- [ ] **Step 5: Write the migration**

`src/migrations/1784288525063-catalog-merchandising.ts`:

```ts
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
```

- [ ] **Step 6: Run the migration**

Run: `cd dajuvai-backend && npm run migration:run`
Expected: output ends with `Migration CatalogMerchandising1784288525063 has been executed successfully.`

- [ ] **Step 7: Verify tables, seed and backfill landed**

Run:

```bash
cd dajuvai-backend && npx ts-node -e "
import AppDataSource from './src/config/db.config';
(async () => {
  await AppDataSource.initialize();
  console.log('placements:', await AppDataSource.query('SELECT code FROM placement ORDER BY \"sortOrder\"'));
  console.log('homepage rows:', await AppDataSource.query('SELECT \"categoryId\",\"displayOrder\",\"visible\" FROM category_placement WHERE \"placementCode\"=\$1 ORDER BY \"displayOrder\"', ['HOMEPAGE']));
  console.log('homecategory rows:', await AppDataSource.query('SELECT count(*) FROM homecategory'));
  await AppDataSource.destroy();
})();
"
```

Expected: seven placement codes; `category_placement` HOMEPAGE row count equals the `homecategory` count, `displayOrder` starting at 0 with no gaps.

- [ ] **Step 8: Verify down() is reversible, then re-apply**

Run: `cd dajuvai-backend && npm run migration:revert && npm run migration:run`
Expected: revert succeeds, re-run succeeds, backfill repopulates from the untouched `homecategory` table.

- [ ] **Step 9: Commit**

```bash
cd dajuvai-backend
git add src/entities/placement.entity.ts src/entities/categoryPlacement.entity.ts src/entities/subcategoryPlacement.entity.ts src/migrations/1784288525063-catalog-merchandising.ts src/config/db.config.ts
git commit -m "feat(merchandising): add placement tables and backfill homepage placement"
```

---

## Task 2: Sort contract and request validation

**Files:**
- Create: `dajuvai-backend/src/utils/merchandising.sort.ts`
- Create: `dajuvai-backend/src/utils/zod_validations/merchandising.zod.ts`
- Create: `dajuvai-backend/src/scripts/merchandising.selfcheck.ts`
- Modify: `dajuvai-backend/package.json`

**Interfaces:**
- Consumes: nothing from Task 1 (pure module).
- Produces:
  - `comparePlacementRows(a: SortablePlacementRow, b: SortablePlacementRow): number`
  - `sortPlacementRows<T extends SortablePlacementRow>(rows: T[]): T[]` (returns a new array)
  - `SortablePlacementRow { id: number; displayOrder: number; pinned: boolean }`
  - `placementCodeSchema`, `addCategoryToPlacementSchema`, `addSubcategoryToPlacementSchema`, `updatePlacementConfigSchema`, `reorderCategoriesSchema`, `reorderSubcategoriesSchema`
  - types `UpdatePlacementConfigInput`, `ReorderCategoriesInput`, `ReorderSubcategoriesInput`

- [ ] **Step 1: Write the failing self-check**

`src/scripts/merchandising.selfcheck.ts`:

```ts
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
```

- [ ] **Step 2: Add the npm scripts**

In `package.json`, in `"scripts"`, after the `check:fcm:db` line:

```json
    "check:merch": "ts-node src/scripts/merchandising.selfcheck.ts",
    "check:merch:db": "ts-node src/scripts/merchandising.dbcheck.ts",
```

- [ ] **Step 3: Run the self-check to verify it fails**

Run: `cd dajuvai-backend && npm run check:merch`
Expected: FAIL — `Cannot find module '../utils/merchandising.sort'`

- [ ] **Step 4: Write the sort module**

`src/utils/merchandising.sort.ts`:

```ts
/**
 * The merchandising sort contract: pinned DESC, displayOrder ASC, id ASC.
 *
 * Public reads apply this in SQL (ORDER BY "pinned" DESC, "displayOrder" ASC,
 * "id" ASC). The admin list merges assigned and unassigned rows in memory and
 * applies it here. Both must agree — merchandising.dbcheck.ts asserts they do.
 */
export interface SortablePlacementRow {
    id: number;
    displayOrder: number;
    pinned: boolean;
}

export const comparePlacementRows = (a: SortablePlacementRow, b: SortablePlacementRow): number => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.displayOrder !== b.displayOrder) return a.displayOrder - b.displayOrder;
    return a.id - b.id;
};

/** Sorts by the contract. Returns a new array; never mutates the input. */
export const sortPlacementRows = <T extends SortablePlacementRow>(rows: T[]): T[] =>
    [...rows].sort(comparePlacementRows);
```

- [ ] **Step 5: Write the zod schemas**

`src/utils/zod_validations/merchandising.zod.ts`:

```ts
import { z } from "zod";

/**
 * Placement codes are SCREAMING_SNAKE and come from the URL, so they are
 * validated before hitting the DB.
 */
export const placementCodeSchema = z
    .string()
    .trim()
    .min(1, "Placement code is required")
    .max(64, "Placement code cannot exceed 64 characters")
    .regex(/^[A-Z0-9_]+$/, "Placement code must be uppercase letters, digits and underscores");

const positiveId = z.coerce.number().int().positive();

export const addCategoryToPlacementSchema = z.object({
    categoryId: positiveId,
});

export const addSubcategoryToPlacementSchema = z.object({
    subcategoryId: positiveId,
});

/**
 * A partial patch: at least one flag must be present, so an empty body is a
 * client bug rather than a silent no-op write.
 */
export const updatePlacementConfigSchema = z
    .object({
        visible: z.boolean().optional(),
        featured: z.boolean().optional(),
        pinned: z.boolean().optional(),
    })
    .refine(
        (value) => Object.keys(value).length > 0,
        "At least one of visible, featured or pinned is required",
    );

const displayOrder = z.coerce.number().int().min(0);

export const reorderCategoriesSchema = z
    .array(z.object({ categoryId: positiveId, displayOrder }))
    .min(1, "Reorder payload cannot be empty")
    .refine(
        (rows) => new Set(rows.map((row) => row.categoryId)).size === rows.length,
        "Duplicate categoryId in reorder payload",
    );

export const reorderSubcategoriesSchema = z
    .array(z.object({ subcategoryId: positiveId, displayOrder }))
    .min(1, "Reorder payload cannot be empty")
    .refine(
        (rows) => new Set(rows.map((row) => row.subcategoryId)).size === rows.length,
        "Duplicate subcategoryId in reorder payload",
    );

export type UpdatePlacementConfigInput = z.infer<typeof updatePlacementConfigSchema>;
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;
export type ReorderSubcategoriesInput = z.infer<typeof reorderSubcategoriesSchema>;
```

- [ ] **Step 6: Run the self-check to verify it passes**

Run: `cd dajuvai-backend && npm run check:merch`
Expected: PASS — eight `ok -` lines, ending `all checks passed`.

- [ ] **Step 7: Commit**

```bash
cd dajuvai-backend
git add src/utils/merchandising.sort.ts src/utils/zod_validations/merchandising.zod.ts src/scripts/merchandising.selfcheck.ts package.json
git commit -m "feat(merchandising): add sort contract, request schemas and self-check"
```

---

## Task 3: MerchandisingService

**Files:**
- Create: `dajuvai-backend/src/service/merchandising.service.ts`
- Create: `dajuvai-backend/src/scripts/merchandising.dbcheck.ts`

**Interfaces:**
- Consumes: entities from Task 1; `sortPlacementRows` from `src/utils/merchandising.sort` (Task 2).
- Produces: `merchandisingService` (a singleton instance) and `MerchandisingService` with:
  - `listPlacements(): Promise<Placement[]>`
  - `getPublicCategories(code: string): Promise<PublicCategoryRow[]>`
  - `getPublicSubcategories(code: string): Promise<PublicSubcategoryRow[]>`
  - `getAdminCategories(code: string): Promise<AdminCategoryRow[]>`
  - `getAdminSubcategories(code: string): Promise<AdminSubcategoryRow[]>`
  - `addToPlacement(target: PlacementTarget, code: string, targetId: number): Promise<void>`
  - `removeFromPlacement(target: PlacementTarget, code: string, targetId: number): Promise<void>`
  - `updateConfig(target, code, targetId, patch: { visible?, featured?, pinned? }): Promise<void>`
  - `reorder(target, code, items: { targetId: number; displayOrder: number }[]): Promise<void>`
  - `replacePlacementSet(target, code, targetIds: number[]): Promise<void>`
  - `type PlacementTarget = "category" | "subcategory"`

- [ ] **Step 1: Write the failing DB check**

`src/scripts/merchandising.dbcheck.ts`:

```ts
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
```

- [ ] **Step 2: Run the DB check to verify it fails**

Run: `cd dajuvai-backend && npm run check:merch:db`
Expected: FAIL — `Cannot find module '../service/merchandising.service'`

- [ ] **Step 3: Write the service**

`src/service/merchandising.service.ts`:

```ts
import { In } from "typeorm";
import AppDataSource from "../config/db.config";
import { Category } from "../entities/category.entity";
import { Subcategory } from "../entities/subcategory.entity";
import { Placement } from "../entities/placement.entity";
import { CategoryPlacement } from "../entities/categoryPlacement.entity";
import { SubcategoryPlacement } from "../entities/subcategoryPlacement.entity";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";
import { sortPlacementRows } from "../utils/merchandising.sort";

export type PlacementTarget = "category" | "subcategory";

export interface PlacementConfigPatch {
    visible?: boolean;
    featured?: boolean;
    pinned?: boolean;
}

export interface ReorderItem {
    targetId: number;
    displayOrder: number;
}

export interface PublicSubcategorySummary {
    id: number;
    name: string;
    image: string | null;
}

export interface PublicCategoryRow {
    categoryId: number;
    name: string;
    image: string | null;
    displayOrder: number;
    featured: boolean;
    pinned: boolean;
    subcategories: PublicSubcategorySummary[];
}

export interface PublicSubcategoryRow {
    subcategoryId: number;
    name: string;
    image: string | null;
    categoryId: number | null;
    displayOrder: number;
    featured: boolean;
    pinned: boolean;
}

export interface AdminCategoryRow {
    categoryId: number;
    name: string;
    image: string | null;
    inPlacement: boolean;
    displayOrder: number;
    visible: boolean;
    featured: boolean;
    pinned: boolean;
}

export interface AdminSubcategoryRow {
    subcategoryId: number;
    name: string;
    image: string | null;
    categoryName: string | null;
    inPlacement: boolean;
    displayOrder: number;
    visible: boolean;
    featured: boolean;
    pinned: boolean;
}

/**
 * Merchandising: where catalog items appear, in what order, and how.
 *
 * Both targets (category, subcategory) have identical placement semantics, so
 * the write paths are shared and keyed off a small target descriptor rather
 * than duplicated. Read paths differ (categories carry subcategories) and stay
 * separate.
 */
export class MerchandisingService {
    private placementRepo = AppDataSource.getRepository(Placement);
    private categoryPlacementRepo = AppDataSource.getRepository(CategoryPlacement);
    private subcategoryPlacementRepo = AppDataSource.getRepository(SubcategoryPlacement);

    private descriptor(target: PlacementTarget) {
        return target === "category"
            ? {
                  placementEntity: CategoryPlacement,
                  catalogEntity: Category,
                  fk: "categoryId" as const,
                  label: "Category",
              }
            : {
                  placementEntity: SubcategoryPlacement,
                  catalogEntity: Subcategory,
                  fk: "subcategoryId" as const,
                  label: "Subcategory",
              };
    }

    /** Throws NotFoundError unless the placement exists and is active. */
    private async assertPlacement(code: string): Promise<Placement> {
        const placement = await this.placementRepo.findOneBy({ code, isActive: true });
        if (!placement) throw new NotFoundError(`Placement ${code}`);
        return placement;
    }

    async listPlacements(): Promise<Placement[]> {
        return this.placementRepo.find({
            where: { isActive: true },
            order: { sortOrder: "ASC", code: "ASC" },
        });
    }

    async getPublicCategories(code: string): Promise<PublicCategoryRow[]> {
        await this.assertPlacement(code);

        const rows = await this.categoryPlacementRepo
            .createQueryBuilder("cp")
            .innerJoinAndSelect("cp.category", "category")
            .leftJoinAndSelect("category.subcategories", "subcategory")
            .where("cp.placementCode = :code", { code })
            .andWhere("cp.visible = true")
            .orderBy("cp.pinned", "DESC")
            .addOrderBy("cp.displayOrder", "ASC")
            .addOrderBy("cp.id", "ASC")
            .getMany();

        return rows.map((row) => ({
            categoryId: row.categoryId,
            name: row.category.name,
            image: row.category.image ?? null,
            displayOrder: row.displayOrder,
            featured: row.featured,
            pinned: row.pinned,
            subcategories: (row.category.subcategories ?? []).map((subcategory) => ({
                id: subcategory.id,
                name: subcategory.name,
                image: subcategory.image ?? null,
            })),
        }));
    }

    async getPublicSubcategories(code: string): Promise<PublicSubcategoryRow[]> {
        await this.assertPlacement(code);

        const rows = await this.subcategoryPlacementRepo
            .createQueryBuilder("sp")
            .innerJoinAndSelect("sp.subcategory", "subcategory")
            .leftJoinAndSelect("subcategory.category", "category")
            .where("sp.placementCode = :code", { code })
            .andWhere("sp.visible = true")
            .orderBy("sp.pinned", "DESC")
            .addOrderBy("sp.displayOrder", "ASC")
            .addOrderBy("sp.id", "ASC")
            .getMany();

        return rows.map((row) => ({
            subcategoryId: row.subcategoryId,
            name: row.subcategory.name,
            image: row.subcategory.image ?? null,
            categoryId: row.subcategory.category?.id ?? null,
            displayOrder: row.displayOrder,
            featured: row.featured,
            pinned: row.pinned,
        }));
    }

    async getAdminCategories(code: string): Promise<AdminCategoryRow[]> {
        await this.assertPlacement(code);

        const categories = await AppDataSource.getRepository(Category).find({
            order: { name: "ASC" },
        });
        const placementRows = await this.categoryPlacementRepo.findBy({ placementCode: code });
        const byCategoryId = new Map(placementRows.map((row) => [row.categoryId, row]));

        const assigned = sortPlacementRows(placementRows).map((row) => {
            const category = categories.find((item) => item.id === row.categoryId)!;
            return {
                categoryId: row.categoryId,
                name: category.name,
                image: category.image ?? null,
                inPlacement: true,
                displayOrder: row.displayOrder,
                visible: row.visible,
                featured: row.featured,
                pinned: row.pinned,
            };
        });

        const unassigned = categories
            .filter((category) => !byCategoryId.has(category.id))
            .map((category) => ({
                categoryId: category.id,
                name: category.name,
                image: category.image ?? null,
                inPlacement: false,
                displayOrder: 0,
                visible: false,
                featured: false,
                pinned: false,
            }));

        return [...assigned, ...unassigned];
    }

    async getAdminSubcategories(code: string): Promise<AdminSubcategoryRow[]> {
        await this.assertPlacement(code);

        const subcategories = await AppDataSource.getRepository(Subcategory).find({
            relations: { category: true },
            order: { name: "ASC" },
        });
        const placementRows = await this.subcategoryPlacementRepo.findBy({ placementCode: code });
        const bySubcategoryId = new Map(placementRows.map((row) => [row.subcategoryId, row]));

        const assigned = sortPlacementRows(placementRows).map((row) => {
            const subcategory = subcategories.find((item) => item.id === row.subcategoryId)!;
            return {
                subcategoryId: row.subcategoryId,
                name: subcategory.name,
                image: subcategory.image ?? null,
                categoryName: subcategory.category?.name ?? null,
                inPlacement: true,
                displayOrder: row.displayOrder,
                visible: row.visible,
                featured: row.featured,
                pinned: row.pinned,
            };
        });

        const unassigned = subcategories
            .filter((subcategory) => !bySubcategoryId.has(subcategory.id))
            .map((subcategory) => ({
                subcategoryId: subcategory.id,
                name: subcategory.name,
                image: subcategory.image ?? null,
                categoryName: subcategory.category?.name ?? null,
                inPlacement: false,
                displayOrder: 0,
                visible: false,
                featured: false,
                pinned: false,
            }));

        return [...assigned, ...unassigned];
    }

    async addToPlacement(target: PlacementTarget, code: string, targetId: number): Promise<void> {
        await this.assertPlacement(code);
        const { placementEntity, catalogEntity, fk, label } = this.descriptor(target);

        const exists = await AppDataSource.getRepository(catalogEntity).findOneBy({ id: targetId });
        if (!exists) throw new NotFoundError(label);

        const repo = AppDataSource.getRepository(placementEntity);
        const already = await repo.findOneBy({ [fk]: targetId, placementCode: code } as any);
        if (already) throw new ConflictError(`${label} is already in placement ${code}`);

        const last = await repo.findOne({
            where: { placementCode: code } as any,
            order: { displayOrder: "DESC" },
        });

        await repo.save(
            repo.create({
                [fk]: targetId,
                placementCode: code,
                displayOrder: last ? last.displayOrder + 1 : 0,
                visible: true,
                featured: false,
                pinned: false,
            } as any),
        );
    }

    async removeFromPlacement(target: PlacementTarget, code: string, targetId: number): Promise<void> {
        await this.assertPlacement(code);
        const { placementEntity, fk, label } = this.descriptor(target);

        const result = await AppDataSource.getRepository(placementEntity).delete({
            [fk]: targetId,
            placementCode: code,
        } as any);

        if (!result.affected) throw new NotFoundError(`${label} in placement ${code}`);
    }

    async updateConfig(
        target: PlacementTarget,
        code: string,
        targetId: number,
        patch: PlacementConfigPatch,
    ): Promise<void> {
        await this.assertPlacement(code);
        const { placementEntity, fk, label } = this.descriptor(target);

        const repo = AppDataSource.getRepository(placementEntity);
        const row = await repo.findOneBy({ [fk]: targetId, placementCode: code } as any);
        if (!row) throw new NotFoundError(`${label} in placement ${code}`);

        await repo.save(repo.merge(row, patch as any));
    }

    /**
     * Applies a whole ordering in one transaction. Every id must already be in
     * the placement: a payload naming an id that is not writes nothing, rather
     * than reordering the half it recognised and leaving the list scrambled.
     */
    async reorder(target: PlacementTarget, code: string, items: ReorderItem[]): Promise<void> {
        await this.assertPlacement(code);
        const { placementEntity, fk, label } = this.descriptor(target);

        await AppDataSource.transaction(async (manager) => {
            const repo = manager.getRepository(placementEntity);
            const existing = await repo.findBy({ placementCode: code } as any);
            const known = new Set(existing.map((row: any) => row[fk] as number));

            const unknown = items.filter((item) => !known.has(item.targetId));
            if (unknown.length > 0) {
                throw new BadRequestError(
                    `${label} ${unknown.map((item) => item.targetId).join(", ")} not in placement ${code}`,
                );
            }

            for (const item of items) {
                await repo.update(
                    { [fk]: item.targetId, placementCode: code } as any,
                    { displayOrder: item.displayOrder } as any,
                );
            }
        });
    }

    /**
     * Replaces the whole set for a placement, ordered by array position. Backs
     * the legacy /api/home/category/section POST.
     */
    async replacePlacementSet(
        target: PlacementTarget,
        code: string,
        targetIds: number[],
    ): Promise<void> {
        await this.assertPlacement(code);
        const { placementEntity, catalogEntity, fk, label } = this.descriptor(target);

        if (targetIds.length > 0) {
            const found = await AppDataSource.getRepository(catalogEntity).findBy({
                id: In(targetIds),
            });
            if (found.length !== new Set(targetIds).size) throw new NotFoundError(label);
        }

        await AppDataSource.transaction(async (manager) => {
            const repo = manager.getRepository(placementEntity);
            // Existing rows carry visible/featured/pinned the caller cannot send,
            // so keep them and only rewrite membership and order.
            const existing = await repo.findBy({ placementCode: code } as any);
            const byTargetId = new Map(existing.map((row: any) => [row[fk] as number, row]));

            const removed = existing.filter((row: any) => !targetIds.includes(row[fk]));
            if (removed.length > 0) await repo.remove(removed);

            const rows = targetIds.map((targetId, index) => {
                const row = byTargetId.get(targetId);
                if (row) {
                    (row as any).displayOrder = index;
                    return row;
                }
                return repo.create({
                    [fk]: targetId,
                    placementCode: code,
                    displayOrder: index,
                    visible: true,
                    featured: false,
                    pinned: false,
                } as any);
            });

            if (rows.length > 0) await repo.save(rows);
        });
    }
}

export const merchandisingService = new MerchandisingService();
```

- [ ] **Step 4: Run the DB check to verify it passes**

Run: `cd dajuvai-backend && npm run check:merch:db`
Expected: PASS — nine `ok -` lines, ending `all checks passed`. Requires a reachable Postgres with at least three categories.

- [ ] **Step 5: Verify the self-check still passes and the project compiles**

Run: `cd dajuvai-backend && npm run check:merch && npx tsc --noEmit`
Expected: self-check passes; `tsc` reports no errors in the files touched by this task.

- [ ] **Step 6: Commit**

```bash
cd dajuvai-backend
git add src/service/merchandising.service.ts src/scripts/merchandising.dbcheck.ts
git commit -m "feat(merchandising): add merchandising service with transactional reorder"
```

---

## Task 4: Public and admin routes

**Files:**
- Create: `dajuvai-backend/src/controllers/merchandising.controller.ts`
- Create: `dajuvai-backend/src/routes/merchandising.routes.ts`
- Create: `dajuvai-backend/src/routes/admin/merchandising.admin.routes.ts`
- Modify: `dajuvai-backend/src/index.ts`

**Interfaces:**
- Consumes: `merchandisingService` (Task 3); schemas from `src/utils/zod_validations/merchandising.zod` (Task 2); `authMiddleware`, `isAdmin`, `isAdminOrStaff` from `src/middlewares/auth.middleware`.
- Produces: routers `merchandisingRoutes` (default export, mounted at `/api/placements`) and `merchandisingAdminRouter` (default export, mounted at `/api/admin/placements`).

- [ ] **Step 1: Write the controller**

`src/controllers/merchandising.controller.ts`:

```ts
import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { merchandisingService, PlacementTarget } from "../service/merchandising.service";
import { BadRequestError, ValidationError } from "../errors";
import {
    placementCodeSchema,
    addCategoryToPlacementSchema,
    addSubcategoryToPlacementSchema,
    updatePlacementConfigSchema,
    reorderCategoriesSchema,
    reorderSubcategoriesSchema,
} from "../utils/zod_validations/merchandising.zod";

type CodeParams = { code: string };
type TargetParams = CodeParams & { targetId: string };

const zodErrors = (error: { errors: { path: (string | number)[]; message: string }[] }) =>
    error.errors.map((issue) => ({ field: issue.path.join("."), message: issue.message }));

export class MerchandisingController {
    /** Placement codes arrive from the URL; normalise and validate before use. */
    private code(raw: string): string {
        const parsed = placementCodeSchema.safeParse(raw?.toUpperCase());
        if (!parsed.success) throw new BadRequestError("Invalid placement code");
        return parsed.data;
    }

    private targetId(raw: string): number {
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0) throw new BadRequestError("Invalid id");
        return id;
    }

    async listPlacements(_req: Request, res: Response, _next: NextFunction): Promise<void> {
        const placements = await merchandisingService.listPlacements();
        res.status(200).json({
            success: true,
            data: placements.map((placement) => ({
                code: placement.code,
                label: placement.label,
                sortOrder: placement.sortOrder,
            })),
        });
    }

    async getPublicCategories(req: Request<CodeParams>, res: Response, _next: NextFunction): Promise<void> {
        const data = await merchandisingService.getPublicCategories(this.code(req.params.code));
        res.status(200).json({ success: true, data });
    }

    async getPublicSubcategories(req: Request<CodeParams>, res: Response, _next: NextFunction): Promise<void> {
        const data = await merchandisingService.getPublicSubcategories(this.code(req.params.code));
        res.status(200).json({ success: true, data });
    }

    async getAdminCategories(req: AuthRequest<CodeParams>, res: Response, _next: NextFunction): Promise<void> {
        const data = await merchandisingService.getAdminCategories(this.code(req.params.code));
        res.status(200).json({ success: true, data });
    }

    async getAdminSubcategories(req: AuthRequest<CodeParams>, res: Response, _next: NextFunction): Promise<void> {
        const data = await merchandisingService.getAdminSubcategories(this.code(req.params.code));
        res.status(200).json({ success: true, data });
    }

    private async add(
        target: PlacementTarget,
        code: string,
        body: unknown,
        next: NextFunction,
    ): Promise<boolean> {
        const schema = target === "category" ? addCategoryToPlacementSchema : addSubcategoryToPlacementSchema;
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
            next(new ValidationError("Validation failed", zodErrors(parsed.error)));
            return false;
        }
        const targetId =
            target === "category"
                ? (parsed.data as { categoryId: number }).categoryId
                : (parsed.data as { subcategoryId: number }).subcategoryId;
        await merchandisingService.addToPlacement(target, code, targetId);
        return true;
    }

    async addCategory(req: AuthRequest<CodeParams>, res: Response, next: NextFunction): Promise<void> {
        const code = this.code(req.params.code);
        if (await this.add("category", code, req.body, next)) {
            res.status(201).json({ success: true, data: await merchandisingService.getAdminCategories(code) });
        }
    }

    async addSubcategory(req: AuthRequest<CodeParams>, res: Response, next: NextFunction): Promise<void> {
        const code = this.code(req.params.code);
        if (await this.add("subcategory", code, req.body, next)) {
            res.status(201).json({ success: true, data: await merchandisingService.getAdminSubcategories(code) });
        }
    }

    async removeCategory(req: AuthRequest<TargetParams>, res: Response, _next: NextFunction): Promise<void> {
        await merchandisingService.removeFromPlacement(
            "category",
            this.code(req.params.code),
            this.targetId(req.params.targetId),
        );
        res.status(200).json({ success: true, message: "Removed from placement" });
    }

    async removeSubcategory(req: AuthRequest<TargetParams>, res: Response, _next: NextFunction): Promise<void> {
        await merchandisingService.removeFromPlacement(
            "subcategory",
            this.code(req.params.code),
            this.targetId(req.params.targetId),
        );
        res.status(200).json({ success: true, message: "Removed from placement" });
    }

    private async update(
        target: PlacementTarget,
        req: AuthRequest<TargetParams>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        const parsed = updatePlacementConfigSchema.safeParse(req.body);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", zodErrors(parsed.error)));
        }
        await merchandisingService.updateConfig(
            target,
            this.code(req.params.code),
            this.targetId(req.params.targetId),
            parsed.data,
        );
        res.status(200).json({ success: true, message: "Placement updated" });
    }

    async updateCategory(req: AuthRequest<TargetParams>, res: Response, next: NextFunction): Promise<void> {
        await this.update("category", req, res, next);
    }

    async updateSubcategory(req: AuthRequest<TargetParams>, res: Response, next: NextFunction): Promise<void> {
        await this.update("subcategory", req, res, next);
    }

    async reorderCategories(req: AuthRequest<CodeParams>, res: Response, next: NextFunction): Promise<void> {
        const parsed = reorderCategoriesSchema.safeParse(req.body);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", zodErrors(parsed.error)));
        }
        const code = this.code(req.params.code);
        await merchandisingService.reorder(
            "category",
            code,
            parsed.data.map((item) => ({ targetId: item.categoryId, displayOrder: item.displayOrder })),
        );
        res.status(200).json({ success: true, data: await merchandisingService.getAdminCategories(code) });
    }

    async reorderSubcategories(req: AuthRequest<CodeParams>, res: Response, next: NextFunction): Promise<void> {
        const parsed = reorderSubcategoriesSchema.safeParse(req.body);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", zodErrors(parsed.error)));
        }
        const code = this.code(req.params.code);
        await merchandisingService.reorder(
            "subcategory",
            code,
            parsed.data.map((item) => ({ targetId: item.subcategoryId, displayOrder: item.displayOrder })),
        );
        res.status(200).json({ success: true, data: await merchandisingService.getAdminSubcategories(code) });
    }
}
```

- [ ] **Step 2: Write the public router**

`src/routes/merchandising.routes.ts`:

```ts
import { Router } from "express";
import { MerchandisingController } from "../controllers/merchandising.controller";

const merchandisingRoutes = Router();
const controller = new MerchandisingController();

/**
 * @swagger
 * /api/placements:
 *   get:
 *     summary: List active placements
 *     description: Surfaces where catalog items can be merchandised (mega menu, homepage, …).
 *     tags:
 *       - Merchandising
 *     responses:
 *       200:
 *         description: Active placements
 */
merchandisingRoutes.get("/", controller.listPlacements.bind(controller));

/**
 * @swagger
 * /api/placements/{code}/categories:
 *   get:
 *     summary: Categories in a placement
 *     description: |
 *       Visible categories for the placement, sorted pinned first then by
 *       display order. Each row carries its subcategories.
 *     tags:
 *       - Merchandising
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *           example: HOMEPAGE
 *     responses:
 *       200:
 *         description: Visible categories in placement order
 *       404:
 *         description: Unknown or inactive placement
 */
merchandisingRoutes.get("/:code/categories", controller.getPublicCategories.bind(controller));

/**
 * @swagger
 * /api/placements/{code}/subcategories:
 *   get:
 *     summary: Subcategories in a placement
 *     tags:
 *       - Merchandising
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *           example: MEGA_MENU
 *     responses:
 *       200:
 *         description: Visible subcategories in placement order
 *       404:
 *         description: Unknown or inactive placement
 */
merchandisingRoutes.get("/:code/subcategories", controller.getPublicSubcategories.bind(controller));

export default merchandisingRoutes;
```

- [ ] **Step 3: Write the admin router**

`src/routes/admin/merchandising.admin.routes.ts`:

```ts
import { Router } from "express";
import { authMiddleware, isAdmin, isAdminOrStaff } from "../../middlewares/auth.middleware";
import { MerchandisingController } from "../../controllers/merchandising.controller";

const merchandisingAdminRouter = Router();
const controller = new MerchandisingController();

/**
 * @swagger
 * /api/admin/placements/{code}/categories:
 *   get:
 *     summary: Every category, merged with its config for this placement
 *     description: |
 *       Returns all categories. Assigned ones come first in placement order and
 *       carry inPlacement=true; unassigned ones follow, alphabetically, so the
 *       admin can add them.
 *     tags:
 *       - Admin Merchandising
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Merged category list
 *       403:
 *         description: Staff or admin access required
 */
merchandisingAdminRouter.get(
    "/:code/categories",
    authMiddleware,
    isAdminOrStaff,
    controller.getAdminCategories.bind(controller),
);

/**
 * @swagger
 * /api/admin/placements/{code}/categories/reorder:
 *   patch:
 *     summary: Apply a whole ordering to a placement
 *     description: |
 *       One transaction. Every categoryId must already be in the placement; a
 *       payload naming an unknown id writes nothing.
 *     tags:
 *       - Admin Merchandising
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: array
 *             items:
 *               type: object
 *               properties:
 *                 categoryId:
 *                   type: integer
 *                 displayOrder:
 *                   type: integer
 *     responses:
 *       200:
 *         description: Updated list
 *       400:
 *         description: An id in the payload is not in the placement
 */
// Declared before /:code/categories/:targetId so "reorder" is not swallowed as an id.
merchandisingAdminRouter.patch(
    "/:code/categories/reorder",
    authMiddleware,
    isAdminOrStaff,
    controller.reorderCategories.bind(controller),
);

/**
 * @swagger
 * /api/admin/placements/{code}/categories:
 *   post:
 *     summary: Add a category to a placement (appended last)
 *     tags:
 *       - Admin Merchandising
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               categoryId:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Added
 *       409:
 *         description: Already in this placement
 */
merchandisingAdminRouter.post(
    "/:code/categories",
    authMiddleware,
    isAdmin,
    controller.addCategory.bind(controller),
);

/**
 * @swagger
 * /api/admin/placements/{code}/categories/{targetId}:
 *   patch:
 *     summary: Toggle visible, featured or pinned
 *     tags:
 *       - Admin Merchandising
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Updated
 *   delete:
 *     summary: Remove a category from a placement
 *     description: Deletes the placement row only. The category itself is untouched.
 *     tags:
 *       - Admin Merchandising
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Removed
 */
merchandisingAdminRouter.patch(
    "/:code/categories/:targetId",
    authMiddleware,
    isAdminOrStaff,
    controller.updateCategory.bind(controller),
);
merchandisingAdminRouter.delete(
    "/:code/categories/:targetId",
    authMiddleware,
    isAdmin,
    controller.removeCategory.bind(controller),
);

/**
 * @swagger
 * /api/admin/placements/{code}/subcategories:
 *   get:
 *     summary: Every subcategory, merged with its config for this placement
 *     tags:
 *       - Admin Merchandising
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Merged subcategory list
 */
merchandisingAdminRouter.get(
    "/:code/subcategories",
    authMiddleware,
    isAdminOrStaff,
    controller.getAdminSubcategories.bind(controller),
);
merchandisingAdminRouter.patch(
    "/:code/subcategories/reorder",
    authMiddleware,
    isAdminOrStaff,
    controller.reorderSubcategories.bind(controller),
);
merchandisingAdminRouter.post(
    "/:code/subcategories",
    authMiddleware,
    isAdmin,
    controller.addSubcategory.bind(controller),
);
merchandisingAdminRouter.patch(
    "/:code/subcategories/:targetId",
    authMiddleware,
    isAdminOrStaff,
    controller.updateSubcategory.bind(controller),
);
merchandisingAdminRouter.delete(
    "/:code/subcategories/:targetId",
    authMiddleware,
    isAdmin,
    controller.removeSubcategory.bind(controller),
);

export default merchandisingAdminRouter;
```

- [ ] **Step 4: Mount both routers**

In `src/index.ts`, add to the imports near the other route imports (after the `homecategoryRoutes` import on line 55):

```ts
import merchandisingRoutes from "./routes/merchandising.routes";
import merchandisingAdminRouter from "./routes/admin/merchandising.admin.routes";
```

and add the mounts next to the existing ones — the public mount after the `app.use("/api/categories", categoryRoutes);` line, and the admin mount after `app.use("/api/admin/users", adminUsersRouter);`:

```ts
app.use("/api/placements", merchandisingRoutes);
```

```ts
app.use("/api/admin/placements", merchandisingAdminRouter);
```

- [ ] **Step 5: Verify the routes respond**

Start the server (`cd dajuvai-backend && npm run dev`) in one shell, then in another:

```bash
curl -s localhost:3000/api/placements
curl -s localhost:3000/api/placements/HOMEPAGE/categories
curl -s localhost:3000/api/placements/NOT_A_PLACEMENT/categories
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/api/admin/placements/HOMEPAGE/categories
```

Expected, in order: seven placements; the HOMEPAGE rows backfilled in Task 1; a 404 `Placement NOT_A_PLACEMENT not found`-shaped error; `401`.

Use the port from `src/config/env.config.ts` if it is not 3000.

- [ ] **Step 6: Verify reorder is not shadowed by the id route**

With an admin bearer token in `$TOKEN`:

```bash
curl -s -X PATCH localhost:3000/api/admin/placements/HOMEPAGE/categories/reorder \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '[{"categoryId":999999,"displayOrder":0}]'
```

Expected: a 400 saying category 999999 is not in placement HOMEPAGE — **not** `Invalid id`. `Invalid id` would mean the `:targetId` route is matching first and the route order must be fixed.

- [ ] **Step 7: Commit**

```bash
cd dajuvai-backend
git add src/controllers/merchandising.controller.ts src/routes/merchandising.routes.ts src/routes/admin/merchandising.admin.routes.ts src/index.ts
git commit -m "feat(merchandising): expose public and admin placement APIs"
```

---

## Task 5: Re-back the legacy HomeCategory endpoint

**Files:**
- Modify: `dajuvai-backend/src/service/home.category.service.ts`

**Interfaces:**
- Consumes: `merchandisingService` (Task 3).
- Produces: `HomeCategoryService.getHomeCategory()` and `HomeCategoryService.handleCreateHomeCategory(ids: number[])` keep their existing signatures and response shape. `home.category.controller.ts` is not modified — its max-5 rule and existence checks stay where they are.

- [ ] **Step 1: Record the current response shape**

Run: `curl -s localhost:3000/api/home/category/section | head -c 400`
Expected: `{"success":true,"data":[{"id":N,"category":{"id":N,"name":"…","image":"…","subcategories":[…]}}]}`. Save this output — Step 4 compares against it.

- [ ] **Step 2: Rewrite the service as an adapter**

Replace the whole of `src/service/home.category.service.ts` with:

```ts
import { merchandisingService } from "./merchandising.service";

/**
 * Legacy homepage-category endpoint, now a thin adapter over the HOMEPAGE
 * placement. The response shape is frozen: storefront and admin clients still
 * consume it, so this must keep returning [{ id, category: { … } }].
 *
 * New work should call /api/placements/HOMEPAGE/categories instead.
 */
const HOMEPAGE = "HOMEPAGE";

export class HomeCategoryService {
    async handleCreateHomeCategory(ids: number[]) {
        await merchandisingService.replacePlacementSet("category", HOMEPAGE, ids);
        return this.getHomeCategory();
    }

    async getHomeCategory() {
        const rows = await merchandisingService.getPublicCategories(HOMEPAGE);

        return rows.map((row) => ({
            // The legacy id was the homecategory row id. Nothing reads it as a
            // key beyond React list rendering, so the category id serves.
            id: row.categoryId,
            category: {
                id: row.categoryId,
                name: row.name,
                image: row.image,
                subcategories: row.subcategories,
            },
        }));
    }
}
```

- [ ] **Step 3: Verify the GET shape is unchanged**

Restart the server, then:

```bash
curl -s localhost:3000/api/home/category/section | head -c 400
```

Expected: same shape as Step 1 — `data[].id`, `data[].category.{id,name,image,subcategories[]}` — now ordered by the placement's `displayOrder`.

- [ ] **Step 4: Verify the POST round-trips through the placement**

With an admin bearer token in `$TOKEN` and two real category ids:

```bash
curl -s -X POST localhost:3000/api/home/category/section \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"categoryId":[2,1]}'
curl -s localhost:3000/api/placements/HOMEPAGE/categories | head -c 200
```

Expected: the POST returns the two categories; the placement read returns category 2 then category 1, `displayOrder` 0 then 1 — array position became the order.

- [ ] **Step 5: Verify the storefront contract still holds**

Run: `cd dajuvai-backend && npm run check:merch && npm run check:merch:db && npx tsc --noEmit`
Expected: all pass, no type errors.

- [ ] **Step 6: Commit**

```bash
cd dajuvai-backend
git add src/service/home.category.service.ts
git commit -m "refactor(merchandising): back legacy home category endpoint with HOMEPAGE placement"
```

---

## Task 6: Admin API client

**Files:**
- Create: `DajuVai_React/dajuvai-frontend/src/api/merchandising.ts`

**Interfaces:**
- Consumes: `axiosInstance` from `src/api/axiosInstance` (it already attaches the auth token).
- Produces:
  - `type MerchTarget = "categories" | "subcategories"`
  - `interface PlacementOption { code, label, sortOrder }`
  - `interface MerchRow { targetId, name, image, parentName, inPlacement, displayOrder, visible, featured, pinned }`
  - `fetchPlacements(): Promise<PlacementOption[]>`
  - `fetchMerchRows(code, target): Promise<MerchRow[]>`
  - `addToPlacement(code, target, targetId): Promise<void>`
  - `removeFromPlacement(code, target, targetId): Promise<void>`
  - `updatePlacementConfig(code, target, targetId, patch): Promise<void>`
  - `reorderPlacement(code, target, orderedIds: number[]): Promise<void>`

- [ ] **Step 1: Write the client**

`src/api/merchandising.ts`:

```ts
import axiosInstance from "./axiosInstance";

export type MerchTarget = "categories" | "subcategories";

export interface PlacementOption {
  code: string;
  label: string;
  sortOrder: number;
}

/**
 * One row of the admin merchandising list. The API names its id field
 * categoryId or subcategoryId depending on the target; the page only ever
 * needs "the thing being merchandised", so it is normalised to targetId here
 * and nowhere else.
 */
export interface MerchRow {
  targetId: number;
  name: string;
  image: string | null;
  parentName: string | null;
  inPlacement: boolean;
  displayOrder: number;
  visible: boolean;
  featured: boolean;
  pinned: boolean;
}

export interface PlacementConfigPatch {
  visible?: boolean;
  featured?: boolean;
  pinned?: boolean;
}

interface RawMerchRow {
  categoryId?: number;
  subcategoryId?: number;
  name: string;
  image: string | null;
  categoryName?: string | null;
  inPlacement: boolean;
  displayOrder: number;
  visible: boolean;
  featured: boolean;
  pinned: boolean;
}

const normalize = (row: RawMerchRow): MerchRow => ({
  targetId: (row.categoryId ?? row.subcategoryId)!,
  name: row.name,
  image: row.image ?? null,
  parentName: row.categoryName ?? null,
  inPlacement: row.inPlacement,
  displayOrder: row.displayOrder,
  visible: row.visible,
  featured: row.featured,
  pinned: row.pinned,
});

const idKey = (target: MerchTarget) =>
  target === "categories" ? "categoryId" : "subcategoryId";

export const fetchPlacements = async (): Promise<PlacementOption[]> => {
  const response = await axiosInstance.get("/api/placements");
  return response.data?.data ?? [];
};

export const fetchMerchRows = async (
  code: string,
  target: MerchTarget,
): Promise<MerchRow[]> => {
  const response = await axiosInstance.get(`/api/admin/placements/${code}/${target}`);
  return (response.data?.data ?? []).map(normalize);
};

export const addToPlacement = async (
  code: string,
  target: MerchTarget,
  targetId: number,
): Promise<void> => {
  await axiosInstance.post(`/api/admin/placements/${code}/${target}`, {
    [idKey(target)]: targetId,
  });
};

export const removeFromPlacement = async (
  code: string,
  target: MerchTarget,
  targetId: number,
): Promise<void> => {
  await axiosInstance.delete(`/api/admin/placements/${code}/${target}/${targetId}`);
};

export const updatePlacementConfig = async (
  code: string,
  target: MerchTarget,
  targetId: number,
  patch: PlacementConfigPatch,
): Promise<void> => {
  await axiosInstance.patch(`/api/admin/placements/${code}/${target}/${targetId}`, patch);
};

/** Sends the whole ordering. Array position becomes displayOrder. */
export const reorderPlacement = async (
  code: string,
  target: MerchTarget,
  orderedIds: number[],
): Promise<void> => {
  await axiosInstance.patch(
    `/api/admin/placements/${code}/${target}/reorder`,
    orderedIds.map((id, index) => ({ [idKey(target)]: id, displayOrder: index })),
  );
};
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd DajuVai_React/dajuvai-frontend && npx tsc -b --noEmit`
Expected: no errors reported for `src/api/merchandising.ts`. (Pre-existing errors in other files may appear; ignore those.)

- [ ] **Step 3: Commit**

```bash
cd DajuVai_React/dajuvai-frontend
git add src/api/merchandising.ts
git commit -m "feat(merchandising): add admin merchandising api client"
```

---

## Task 7: Admin Merchandising page

**Files:**
- Create: `DajuVai_React/dajuvai-frontend/src/Pages/AdminMerchandising.tsx`
- Create: `DajuVai_React/dajuvai-frontend/src/Styles/AdminMerchandising.css`
- Modify: `DajuVai_React/dajuvai-frontend/src/App.tsx`
- Modify: `DajuVai_React/dajuvai-frontend/src/Components/AdminSidebar.tsx`

**Interfaces:**
- Consumes: everything from Task 6; `AdminSidebar`, `Header`, `useAuth` as the other admin pages do.
- Produces: default-exported `AdminMerchandising` component at route `/admin-merchandising`.

- [ ] **Step 1: Write the page**

`src/Pages/AdminMerchandising.tsx`:

```tsx
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  Eye,
  EyeOff,
  Star,
  Pin,
  Plus,
  X,
  Search,
} from "lucide-react";
import { AdminSidebar } from "../Components/AdminSidebar";
import Header from "../Components/Header";
import { useAuth } from "../context/AuthContext";
import {
  fetchPlacements,
  fetchMerchRows,
  addToPlacement,
  removeFromPlacement,
  updatePlacementConfig,
  reorderPlacement,
  type MerchRow,
  type MerchTarget,
  type PlacementConfigPatch,
} from "../api/merchandising";
import "../Styles/AdminMerchandising.css";

type FilterKey = "all" | "visible" | "hidden" | "featured" | "pinned" | "unassigned";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "visible", label: "Visible" },
  { key: "hidden", label: "Hidden" },
  { key: "featured", label: "Featured" },
  { key: "pinned", label: "Pinned" },
  { key: "unassigned", label: "Not in placement" },
];

/**
 * Moves the item at `from` to `to`, returning a new array. Out-of-range moves
 * are no-ops so the first/last buttons need no guards at the call site.
 */
const move = <T,>(rows: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= rows.length || from === to) return rows;
  const next = [...rows];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

const AdminMerchandising = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [placementCode, setPlacementCode] = useState<string>("");
  const [target, setTarget] = useState<MerchTarget>("categories");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  // Local order while the admin is arranging. null = showing server order.
  const [draftOrder, setDraftOrder] = useState<number[] | null>(null);

  const isAdmin = user?.role === "admin";

  const { data: placements = [] } = useQuery({
    queryKey: ["placements"],
    queryFn: fetchPlacements,
    staleTime: 5 * 60 * 1000,
  });

  const activeCode = placementCode || placements[0]?.code || "";

  const rowsKey = ["merch-rows", activeCode, target];
  const { data: rows = [], isLoading } = useQuery({
    queryKey: rowsKey,
    queryFn: () => fetchMerchRows(activeCode, target),
    enabled: Boolean(activeCode),
  });

  const assigned = useMemo(() => rows.filter((row) => row.inPlacement), [rows]);
  const unassigned = useMemo(() => rows.filter((row) => !row.inPlacement), [rows]);

  // Draft order holds ids; resolve back to rows, dropping any the server no
  // longer returns (e.g. removed in another tab).
  const orderedAssigned = useMemo(() => {
    if (!draftOrder) return assigned;
    const byId = new Map(assigned.map((row) => [row.targetId, row]));
    const drafted = draftOrder
      .map((id) => byId.get(id))
      .filter((row): row is MerchRow => Boolean(row));
    const missing = assigned.filter((row) => !draftOrder.includes(row.targetId));
    return [...drafted, ...missing];
  }, [assigned, draftOrder]);

  const isDirty =
    draftOrder !== null &&
    orderedAssigned.some((row, index) => assigned[index]?.targetId !== row.targetId);

  const matchesSearch = (row: MerchRow) =>
    row.name.toLowerCase().includes(search.trim().toLowerCase());

  const visibleAssigned = orderedAssigned.filter((row) => {
    if (!matchesSearch(row)) return false;
    if (filter === "visible") return row.visible;
    if (filter === "hidden") return !row.visible;
    if (filter === "featured") return row.featured;
    if (filter === "pinned") return row.pinned;
    if (filter === "unassigned") return false;
    return true;
  });

  const visibleUnassigned = unassigned.filter(
    (row) => matchesSearch(row) && (filter === "all" || filter === "unassigned"),
  );

  const invalidate = () => queryClient.invalidateQueries({ queryKey: rowsKey });

  const configMutation = useMutation({
    mutationFn: ({ targetId, patch }: { targetId: number; patch: PlacementConfigPatch }) =>
      updatePlacementConfig(activeCode, target, targetId, patch),
    onSuccess: invalidate,
    onError: () => toast.error("Could not update. Try again."),
  });

  const addMutation = useMutation({
    mutationFn: (targetId: number) => addToPlacement(activeCode, target, targetId),
    onSuccess: () => {
      invalidate();
      toast.success("Added to placement");
    },
    onError: () => toast.error("Could not add. Try again."),
  });

  const removeMutation = useMutation({
    mutationFn: (targetId: number) => removeFromPlacement(activeCode, target, targetId),
    onSuccess: () => {
      setDraftOrder(null);
      invalidate();
      toast.success("Removed from placement");
    },
    onError: () => toast.error("Could not remove. Try again."),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      reorderPlacement(
        activeCode,
        target,
        orderedAssigned.map((row) => row.targetId),
      ),
    onSuccess: () => {
      setDraftOrder(null);
      invalidate();
      toast.success("Order saved");
    },
    onError: () => toast.error("Could not save the order. Try again."),
  });

  /**
   * Pinned rows sort above unpinned by contract, so a move is only meaningful
   * inside its own pinned/unpinned group. Indices are computed within the
   * group and mapped back onto the full list.
   */
  const moveRow = (targetId: number, to: "up" | "down" | "top" | "bottom") => {
    const list = orderedAssigned;
    const row = list.find((item) => item.targetId === targetId);
    if (!row) return;

    const group = list.filter((item) => item.pinned === row.pinned);
    const groupIndex = group.findIndex((item) => item.targetId === targetId);
    const destination =
      to === "up" ? groupIndex - 1
      : to === "down" ? groupIndex + 1
      : to === "top" ? 0
      : group.length - 1;

    const reorderedGroup = move(group, groupIndex, destination);
    if (reorderedGroup === group) return;

    const pinned = row.pinned ? reorderedGroup : list.filter((item) => item.pinned);
    const rest = row.pinned ? list.filter((item) => !item.pinned) : reorderedGroup;
    setDraftOrder([...pinned, ...rest].map((item) => item.targetId));
  };

  const switchPlacement = (code: string) => {
    setDraftOrder(null);
    setPlacementCode(code);
  };

  const switchTarget = (next: MerchTarget) => {
    setDraftOrder(null);
    setTarget(next);
  };

  const renderRow = (row: MerchRow, index: number, groupLength: number) => (
    <li key={row.targetId} className="merch-row">
      <div className="merch-row__order">
        <button
          type="button"
          className="merch-icon-btn"
          title="Move to top"
          disabled={index === 0}
          onClick={() => moveRow(row.targetId, "top")}
        >
          <ChevronsUp size={16} />
        </button>
        <button
          type="button"
          className="merch-icon-btn"
          title="Move up"
          disabled={index === 0}
          onClick={() => moveRow(row.targetId, "up")}
        >
          <ChevronUp size={16} />
        </button>
        <button
          type="button"
          className="merch-icon-btn"
          title="Move down"
          disabled={index === groupLength - 1}
          onClick={() => moveRow(row.targetId, "down")}
        >
          <ChevronDown size={16} />
        </button>
        <button
          type="button"
          className="merch-icon-btn"
          title="Move to bottom"
          disabled={index === groupLength - 1}
          onClick={() => moveRow(row.targetId, "bottom")}
        >
          <ChevronsDown size={16} />
        </button>
      </div>

      {row.image ? (
        <img className="merch-row__thumb" src={row.image} alt="" loading="lazy" />
      ) : (
        <span className="merch-row__thumb merch-row__thumb--empty" aria-hidden="true" />
      )}

      <div className="merch-row__label">
        <span className="merch-row__name">{row.name}</span>
        {row.parentName && <span className="merch-row__parent">{row.parentName}</span>}
      </div>

      <div className="merch-row__flags">
        <button
          type="button"
          className={`merch-flag ${row.visible ? "merch-flag--on" : ""}`}
          title={row.visible ? "Visible - click to hide" : "Hidden - click to show"}
          onClick={() =>
            configMutation.mutate({ targetId: row.targetId, patch: { visible: !row.visible } })
          }
        >
          {row.visible ? <Eye size={16} /> : <EyeOff size={16} />}
          <span>{row.visible ? "Visible" : "Hidden"}</span>
        </button>
        <button
          type="button"
          className={`merch-flag ${row.featured ? "merch-flag--on" : ""}`}
          title="Featured changes the design, not the order"
          onClick={() =>
            configMutation.mutate({ targetId: row.targetId, patch: { featured: !row.featured } })
          }
        >
          <Star size={16} />
          <span>Featured</span>
        </button>
        <button
          type="button"
          className={`merch-flag ${row.pinned ? "merch-flag--on" : ""}`}
          title="Pinned keeps the item above unpinned items"
          onClick={() => {
            setDraftOrder(null);
            configMutation.mutate({ targetId: row.targetId, patch: { pinned: !row.pinned } });
          }}
        >
          <Pin size={16} />
          <span>Pinned</span>
        </button>
        {isAdmin && (
          <button
            type="button"
            className="merch-icon-btn merch-icon-btn--danger"
            title="Remove from this placement"
            onClick={() => removeMutation.mutate(row.targetId)}
          >
            <X size={16} />
          </button>
        )}
      </div>
    </li>
  );

  const pinnedRows = visibleAssigned.filter((row) => row.pinned);
  const unpinnedRows = visibleAssigned.filter((row) => !row.pinned);

  return (
    <div className="admin-layout">
      <AdminSidebar />
      <div className="admin-main">
        <Header />
        <div className="merch">
          <div className="merch__head">
            <div>
              <h1 className="merch__title">Merchandising</h1>
              <p className="merch__subtitle">
                Categories only know they exist. Merchandising decides where they appear.
              </p>
            </div>
            <button
              type="button"
              className="merch__save"
              disabled={!isDirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Saving…" : "Save Changes"}
            </button>
          </div>

          <div className="merch__controls">
            <label className="merch__control">
              <span>Placement</span>
              <select value={activeCode} onChange={(event) => switchPlacement(event.target.value)}>
                {placements.map((placement) => (
                  <option key={placement.code} value={placement.code}>
                    {placement.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="merch__tabs">
              <button
                type="button"
                className={target === "categories" ? "merch__tab merch__tab--active" : "merch__tab"}
                onClick={() => switchTarget("categories")}
              >
                Categories
              </button>
              <button
                type="button"
                className={target === "subcategories" ? "merch__tab merch__tab--active" : "merch__tab"}
                onClick={() => switchTarget("subcategories")}
              >
                Sub Categories
              </button>
            </div>

            <label className="merch__search">
              <Search size={16} />
              <input
                type="search"
                placeholder={`Search ${target === "categories" ? "category" : "subcategory"}…`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
          </div>

          <div className="merch__filters">
            {FILTERS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={filter === option.key ? "merch__chip merch__chip--active" : "merch__chip"}
                onClick={() => setFilter(option.key)}
              >
                {option.label}
              </button>
            ))}
          </div>

          {isDirty && (
            <p className="merch__dirty">Order changed. Click Save Changes to apply.</p>
          )}

          {isLoading ? (
            <p className="merch__empty">Loading…</p>
          ) : (
            <>
              {pinnedRows.length > 0 && (
                <>
                  <h2 className="merch__group">Pinned</h2>
                  <ul className="merch__list">
                    {pinnedRows.map((row, index) => renderRow(row, index, pinnedRows.length))}
                  </ul>
                </>
              )}

              {unpinnedRows.length > 0 && (
                <>
                  {pinnedRows.length > 0 && <h2 className="merch__group">Everything else</h2>}
                  <ul className="merch__list">
                    {unpinnedRows.map((row, index) => renderRow(row, index, unpinnedRows.length))}
                  </ul>
                </>
              )}

              {visibleAssigned.length === 0 && (
                <p className="merch__empty">
                  Nothing in this placement yet. Add something from the list below.
                </p>
              )}

              {visibleUnassigned.length > 0 && (
                <>
                  <h2 className="merch__group">Not in this placement</h2>
                  <ul className="merch__list merch__list--muted">
                    {visibleUnassigned.map((row) => (
                      <li key={row.targetId} className="merch-row merch-row--muted">
                        <div className="merch-row__label">
                          <span className="merch-row__name">{row.name}</span>
                          {row.parentName && (
                            <span className="merch-row__parent">{row.parentName}</span>
                          )}
                        </div>
                        {isAdmin ? (
                          <button
                            type="button"
                            className="merch-row__add"
                            onClick={() => addMutation.mutate(row.targetId)}
                          >
                            <Plus size={16} /> Add
                          </button>
                        ) : (
                          <span className="merch-row__note">Admin only</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminMerchandising;
```

- [ ] **Step 2: Write the styles**

`src/Styles/AdminMerchandising.css`:

```css
.merch {
  padding: 24px;
  max-width: 1100px;
}

.merch__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}

.merch__title {
  font-size: 22px;
  font-weight: 600;
  margin: 0;
}

.merch__subtitle {
  margin: 4px 0 0;
  color: #6b7280;
  font-size: 13px;
}

.merch__save {
  padding: 9px 18px;
  border: none;
  border-radius: 6px;
  background: #ea580c;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.merch__save:disabled {
  background: #e5e7eb;
  color: #9ca3af;
  cursor: not-allowed;
}

.merch__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 16px;
  margin-bottom: 12px;
}

.merch__control {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: #6b7280;
}

.merch__control select {
  padding: 8px 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  min-width: 200px;
  font-size: 14px;
  color: #111827;
}

.merch__tabs {
  display: flex;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  overflow: hidden;
}

.merch__tab {
  padding: 9px 16px;
  border: none;
  background: #fff;
  cursor: pointer;
  font-size: 14px;
}

.merch__tab--active {
  background: #111827;
  color: #fff;
}

.merch__search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  color: #9ca3af;
  flex: 1;
  min-width: 220px;
}

.merch__search input {
  border: none;
  outline: none;
  padding: 9px 0;
  width: 100%;
  font-size: 14px;
  color: #111827;
}

.merch__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.merch__chip {
  padding: 5px 12px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}

.merch__chip--active {
  background: #111827;
  border-color: #111827;
  color: #fff;
}

.merch__dirty {
  margin: 0 0 12px;
  padding: 8px 12px;
  border-radius: 6px;
  background: #fff7ed;
  color: #9a3412;
  font-size: 13px;
}

.merch__group {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6b7280;
  margin: 20px 0 8px;
}

.merch__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.merch__list--muted {
  opacity: 0.85;
}

.merch__empty {
  color: #6b7280;
  font-size: 14px;
  padding: 24px 0;
}

.merch-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #fff;
}

.merch-row--muted {
  background: #f9fafb;
  justify-content: space-between;
}

.merch-row__order {
  display: flex;
  gap: 2px;
}

.merch-row__thumb {
  width: 36px;
  height: 36px;
  border-radius: 6px;
  object-fit: cover;
  background: #f3f4f6;
  flex-shrink: 0;
}

.merch-row__label {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.merch-row__name {
  font-size: 14px;
  font-weight: 500;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.merch-row__parent {
  font-size: 12px;
  color: #9ca3af;
}

.merch-row__flags {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.merch-flag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: #fff;
  color: #6b7280;
  font-size: 12px;
  cursor: pointer;
}

.merch-flag--on {
  border-color: #ea580c;
  background: #fff7ed;
  color: #c2410c;
}

.merch-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  background: #fff;
  color: #4b5563;
  cursor: pointer;
}

.merch-icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.merch-icon-btn--danger:hover {
  border-color: #ef4444;
  color: #ef4444;
}

.merch-row__add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}

.merch-row__note {
  font-size: 12px;
  color: #9ca3af;
}

@media (max-width: 768px) {
  .merch-row {
    flex-wrap: wrap;
  }

  .merch-row__flags {
    width: 100%;
  }
}
```

- [ ] **Step 3: Add the route**

In `src/App.tsx`, add the import next to the other admin page imports:

```tsx
import AdminMerchandising from "./Pages/AdminMerchandising";
```

and add the route immediately after the existing `/admin-categories` route block:

```tsx
          <Route
            path="/admin-merchandising"
            element={
              <AdminOrStaffRoute>
                <AdminMerchandising />
              </AdminOrStaffRoute>
            }
          />
```

- [ ] **Step 4: Add the sidebar link**

In `src/Components/AdminSidebar.tsx`, add this `NavItem` immediately after the `/admin-categories` one (which renders "Categories"):

```tsx
        <NavItem
          to="/admin-merchandising"
          active={location.pathname === "/admin-merchandising"}
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 6H20M4 12H20M4 18H14M17 15L20 18L17 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        >
          Merchandising
        </NavItem>
```

- [ ] **Step 5: Verify it type-checks**

Run: `cd DajuVai_React/dajuvai-frontend && npx tsc -b --noEmit`
Expected: no errors in `src/Pages/AdminMerchandising.tsx`, `src/api/merchandising.ts`, `src/App.tsx` or `src/Components/AdminSidebar.tsx`.

- [ ] **Step 6: Verify the page in a browser**

Start the backend (`cd dajuvai-backend && npm run dev`) and the admin (`cd DajuVai_React/dajuvai-frontend && npm run dev`). Log in as an admin, open `/admin-merchandising`, and confirm each of these:

1. The Placement dropdown lists all seven placements.
2. HOMEPAGE shows the backfilled categories; other placements start empty with the "Nothing in this placement yet" message and a "Not in this placement" list.
3. Add appends a category to the end of the list.
4. Move up/down/top/bottom rearrange rows, "Order changed" appears, Save Changes persists — reload and the order holds.
5. Pin a row: it jumps to a "Pinned" group above the rest; move buttons only shuffle it within that group.
6. Hide a row: it stays in the admin list marked Hidden, and disappears from `curl -s localhost:3000/api/placements/HOMEPAGE/categories`.
7. Switching placement or tab discards an unsaved order rather than carrying it across.
8. Logged in as staff (not admin): Add and remove are not offered; move, hide, feature and pin still work.

- [ ] **Step 7: Commit**

```bash
cd DajuVai_React/dajuvai-frontend
git add src/Pages/AdminMerchandising.tsx src/Styles/AdminMerchandising.css src/App.tsx src/Components/AdminSidebar.tsx
git commit -m "feat(merchandising): add admin merchandising page"
```

---

## Task 8: Storefront placement wiring

**Files:**
- Create: `dajuvai-nextjs-frontend/lib/api/placements.ts`
- Modify: `dajuvai-nextjs-frontend/lib/api/categoryCatalog.ts`
- Modify: `dajuvai-nextjs-frontend/components/Components/Navbar.tsx:343-360`
- Modify: `dajuvai-nextjs-frontend/components/Components/CategorySlider.tsx:32-40`

**Interfaces:**
- Consumes: the public API from Task 4; `fetchCategory` from `lib/api/category` as the fallback.
- Produces:
  - `interface PlacementCategory { id, name, image, featured, pinned, subcategories }`
  - `fetchPlacementCategories(code: string): Promise<PlacementCategory[]>` — falls back to every category when the placement is empty or errors.
  - `PLACEMENTS = { MEGA_MENU, HOMEPAGE, MOBILE, SEARCH, CATEGORY_GRID, FEATURED, DEALS }`

- [ ] **Step 1: Write the placements client**

`lib/api/placements.ts`:

```ts
import axiosInstance from "./axiosInstance";
import { fetchCategory } from "./category";

export const PLACEMENTS = {
	MEGA_MENU: "MEGA_MENU",
	HOMEPAGE: "HOMEPAGE",
	MOBILE: "MOBILE",
	SEARCH: "SEARCH",
	CATEGORY_GRID: "CATEGORY_GRID",
	FEATURED: "FEATURED",
	DEALS: "DEALS",
} as const;

export interface PlacementSubcategory {
	id: number;
	name: string;
	image: string | null;
}

/**
 * Shaped like the /api/categories rows the components already consume, so a
 * component switches source by changing its queryFn and nothing else.
 */
export interface PlacementCategory {
	id: number;
	name: string;
	image: string | null;
	featured: boolean;
	pinned: boolean;
	subcategories: PlacementSubcategory[];
}

interface RawPlacementCategory {
	categoryId: number;
	name: string;
	image: string | null;
	featured: boolean;
	pinned: boolean;
	subcategories?: PlacementSubcategory[];
}

const fromCatalog = (rows: unknown): PlacementCategory[] =>
	(Array.isArray(rows) ? rows : []).map((row: any) => ({
		id: row.id,
		name: row.name,
		image: row.image ?? null,
		featured: false,
		pinned: false,
		subcategories: row.subcategories ?? [],
	}));

/**
 * Categories for a placement, in merchandising order.
 *
 * Falls back to the full category list when the placement is empty or the
 * request fails: an unconfigured placement must not blank out the navbar or
 * the homepage. Once merchandisers configure the placement, the fallback stops
 * firing on its own.
 */
export const fetchPlacementCategories = async (
	code: string,
): Promise<PlacementCategory[]> => {
	try {
		const response = await axiosInstance.get(`/api/placements/${code}/categories`);
		const rows: RawPlacementCategory[] = response.data?.data ?? [];

		if (rows.length > 0) {
			return rows.map((row) => ({
				id: row.categoryId,
				name: row.name,
				image: row.image ?? null,
				featured: row.featured,
				pinned: row.pinned,
				subcategories: row.subcategories ?? [],
			}));
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unknown error";
		console.warn(`Placement ${code} unavailable, falling back to all categories:`, message);
	}

	return fromCatalog(await fetchCategory());
};
```

- [ ] **Step 2: Point the homepage catalog section at HOMEPAGE**

Replace the whole of `lib/api/categoryCatalog.ts` with:

```ts
import { fetchPlacementCategories, PLACEMENTS } from "./placements";

/**
 * Homepage category catalog, sourced from the HOMEPAGE placement.
 *
 * The [{ id, category: {…} }] shape is what CategoryCatalogSection and
 * CategorySection already render, so it is preserved here rather than changed
 * in both components.
 */
export const fetchCategoryCatalog = async () => {
	const rows = await fetchPlacementCategories(PLACEMENTS.HOMEPAGE);

	return rows.map((row) => ({
		id: row.id,
		featured: row.featured,
		category: {
			id: row.id,
			name: row.name,
			image: row.image,
			subcategories: row.subcategories,
		},
	}));
};
```

- [ ] **Step 3: Point the navbar at MEGA_MENU**

In `components/Components/Navbar.tsx`, add to the imports next to the existing `fetchCategory` import (line 28):

```tsx
import { fetchPlacementCategories, PLACEMENTS } from '@/lib/api/placements';
```

and replace the categories query (the `useQuery<Category[]>` block at lines 343-360, whose `queryFn` calls `axiosInstance.get('/api/categories')`) with:

```tsx
	const { data: categoriesData, isLoading: isCategoriesLoading } = useQuery({
		queryKey: ['placement', PLACEMENTS.MEGA_MENU],
		queryFn: () => fetchPlacementCategories(PLACEMENTS.MEGA_MENU),
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});
```

Leave the `useEffect` that feeds `updateCategoriesWithSubcategories(categoriesData)` alone — it takes the same `{ id, name, image }` rows.

- [ ] **Step 4: Point the category slider at CATEGORY_GRID**

In `components/Components/CategorySlider.tsx`, replace the `fetchCategory` import (line 10):

```tsx
import { fetchPlacementCategories, PLACEMENTS } from "@/lib/api/placements";
```

and replace the query (lines 32-40):

```tsx
  const { data: categoryData, isLoading: isCategoryLoading } = useQuery({
    queryKey: ["placement", PLACEMENTS.CATEGORY_GRID],
    queryFn: () => fetchPlacementCategories(PLACEMENTS.CATEGORY_GRID),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
```

- [ ] **Step 5: Verify it type-checks and builds**

Run: `cd dajuvai-nextjs-frontend && npx tsc --noEmit`
Expected: no new errors in `lib/api/placements.ts`, `lib/api/categoryCatalog.ts`, `Navbar.tsx` or `CategorySlider.tsx`. The repo has a `typescript-errors.txt` of known pre-existing errors — ignore anything listed there.

- [ ] **Step 6: Verify the fallback and the wiring in a browser**

With the backend running, start the storefront (`cd dajuvai-nextjs-frontend && npm run dev`) and check both states:

*Fallback (MEGA_MENU and CATEGORY_GRID are empty out of the box):*
1. Home page: navbar mega menu lists every category; the category slider renders every category. Nothing is blank.
2. The browser console shows `Placement MEGA_MENU unavailable, falling back to all categories` only if the request failed — an empty placement falls back silently.

*Configured:*
3. In the admin, add three categories to MEGA_MENU in a deliberate order, hide one, and save.
4. Reload the storefront: the navbar shows exactly the two visible categories, in the configured order — not all categories, and not the hidden one.
5. Repeat for CATEGORY_GRID and confirm the slider follows it.
6. Reorder HOMEPAGE in the admin, reload: the homepage category section follows the new order.

- [ ] **Step 7: Commit**

```bash
cd dajuvai-nextjs-frontend
git add lib/api/placements.ts lib/api/categoryCatalog.ts components/Components/Navbar.tsx components/Components/CategorySlider.tsx
git commit -m "feat(merchandising): source storefront categories from placements"
```

---

## Done when

- `npm run check:merch` and `npm run check:merch:db` pass in `dajuvai-backend`.
- The admin Merchandising page reorders, hides, features and pins for every placement, for both categories and subcategories.
- The storefront navbar, homepage section and category slider follow their placements, and fall back to all categories when a placement is empty.
- `/api/home/category/section` returns its original shape, now backed by the HOMEPAGE placement.
- No column was added to `category` or `subcategory`.
