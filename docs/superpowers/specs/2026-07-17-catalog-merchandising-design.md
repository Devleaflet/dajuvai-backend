# Catalog Management System — Catalog / Merchandising Separation

Date: 2026-07-17
Status: Approved for planning

## Problem

Presentation concerns (where a category appears, in what order, whether it is
featured) leak into catalog tables in most e-commerce systems. Every new surface
adds a column: `displayOrder`, `homepageOrder`, `megaMenuOrder`, `isFeatured`,
`showInMegaMenu`. The table becomes unmaintainable and every new surface is a
migration plus a code change.

DajuVai has not fully hit this yet — `Category` and `Subcategory` are still
clean — but the pattern has started: `HomeCategory` is a homepage-only,
order-less, visibility-less proto-placement. This design generalises it before
more surfaces are hardcoded.

## Principle

Two responsibilities, two modules:

- **Catalog** — what exists. `Category`, `Subcategory`. Knows nothing about display.
- **Merchandising** — where things appear. Placement rows decide surface, order,
  visibility, featured, pinned.

The same category appears in multiple placements with different behavior. New
placements are added by inserting a row, not by changing the schema.

## Scope

Ships now: **Phase 1 + Phase 2**, backend + admin + storefront.

- Phase 1: placement rows, ordering, visibility, bulk reorder API.
- Phase 2: multiple placements, featured and pinned flags, admin search + filters.

Explicitly deferred to Phase 3 (not built, not schemed):

- Scheduling (`startDate` / `endDate`)
- Bulk actions (multi-select hide/show/feature)
- Audit log
- Preview before publishing

Reordering uses **move up / move down / move to top / move to bottom buttons**,
not drag-and-drop, per product decision.

## Repositories

| Repo | Role | Branch |
|---|---|---|
| `dajuvai-backend` | Express 5 + TypeORM + Postgres API | `fcm_notification` |
| `DajuVai_React/dajuvai-frontend` | Admin panel (React 19 + Vite + React Query) | `master` |
| `dajuvai-nextjs-frontend` | Customer storefront (Next.js) | `main` |

## Data model

`category` and `subcategory` are **not modified**. Three new tables.

### `placement`

| Column | Type | Notes |
|---|---|---|
| `code` | varchar(64) PK | `MEGA_MENU`, `HOMEPAGE`, … |
| `label` | varchar(128) | Human label for the admin dropdown |
| `isActive` | boolean, default true | Inactive placements hidden from admin + public list |
| `sortOrder` | int, default 0 | Order of the placement dropdown itself |
| `createdAt` / `updatedAt` | timestamptz | |

Seeded rows: `MEGA_MENU`, `HOMEPAGE`, `MOBILE`, `SEARCH`, `CATEGORY_GRID`,
`FEATURED`, `DEALS`. Adding `BLACK_FRIDAY` later is an INSERT, not a deploy.

Placement is a DB-configurable lookup table, deliberately not a TypeScript enum.
Code that needs a specific placement references the string code.

### `category_placement`

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `categoryId` | int, FK → `category.id`, ON DELETE CASCADE | |
| `placementCode` | varchar(64), FK → `placement.code`, ON DELETE CASCADE | |
| `displayOrder` | int, default 0 | |
| `visible` | boolean, default true | |
| `featured` | boolean, default false | Affects design (large card), not order |
| `pinned` | boolean, default false | Affects order, not design |
| `createdAt` / `updatedAt` | timestamptz | |

Constraints:

- `UNIQUE (categoryId, placementCode)` — one config per category per placement.
- `INDEX (placementCode, pinned, displayOrder)` — covers the read path.

### `subcategory_placement`

Identical shape, `subcategoryId` FK → `subcategory.id` ON DELETE CASCADE,
`UNIQUE (subcategoryId, placementCode)`, same index.

### Sort contract

Every read of a placement sorts by:

```
pinned DESC, displayOrder ASC, id ASC
```

Pinned items float above unpinned. `id ASC` is the tiebreaker so equal
`displayOrder` values never produce a nondeterministic order.

## API

### Public

```
GET /api/placements
      → [{ code, label, sortOrder }]  (isActive only)

GET /api/placements/:code/categories
      → [{ categoryId, name, image, displayOrder, featured, pinned, subcategories[] }]
        visible = true only, sorted by the sort contract

GET /api/placements/:code/subcategories
      → same shape for subcategories
```

Unknown or inactive `:code` → 404 `NotFoundError`.

### Admin (`/api/admin/placements`)

```
GET    /api/admin/placements/:code/categories
         admin + staff. Returns EVERY category, each merged with its placement
         config when one exists:
         { categoryId, name, image, inPlacement, displayOrder, visible, featured, pinned }
         Assigned rows first (sort contract), unassigned after (name ASC).
         Admin needs unassigned categories visible in order to add them.

POST   /api/admin/placements/:code/categories        admin only
         body { categoryId } → appended at max(displayOrder)+1, visible=true
         Already assigned → 409 ConflictError

DELETE /api/admin/placements/:code/categories/:categoryId    admin only
         Removes the placement row. Category itself untouched.

PATCH  /api/admin/placements/:code/categories/:categoryId    admin + staff
         body { visible?, featured?, pinned? }

PATCH  /api/admin/placements/:code/categories/reorder        admin + staff
         body [{ categoryId, displayOrder }, …]
         Single transaction. All ids must already be in the placement, else 400
         and nothing is written.
```

The same five routes exist under `/api/admin/placements/:code/subcategories`
with `subcategoryId` in place of `categoryId`.

### Permissions

| Action | ADMIN | STAFF |
|---|---|---|
| Create/delete categories | yes | no |
| Add/remove category to placement | yes | no |
| Reorder | yes | yes |
| Toggle visible / featured / pinned | yes | yes |

Implemented with the existing `isAdmin` and `isAdminOrStaff` middlewares.

### Legacy compatibility

`/api/home/category/section` is kept and re-backed by the new tables:

- `GET` reads `category_placement` where `placementCode = 'HOMEPAGE'` and
  `visible = true`, and returns the **existing response shape**
  (`[{ id, category: { id, name, image, subcategories[] } }]`) so current
  storefront and admin consumers keep working unchanged.
- `POST` replaces the HOMEPAGE placement set with the posted category ids,
  assigning `displayOrder` by array position.

`HomeCategoryService` becomes a thin adapter over the merchandising service.
The `homecategory` table is retained but no longer written to; the migration
copies its rows across, and `down()` restores from it.

## Migration

One migration, following the existing `src/migrations` timestamp-class pattern:

1. Create `placement`, `category_placement`, `subcategory_placement`.
2. Seed the seven placement rows.
3. Backfill: copy `homecategory` rows → `category_placement` with
   `placementCode='HOMEPAGE'`, `displayOrder` by `homecategory.id` ascending,
   `visible=true`, `featured=false`, `pinned=false`.
4. `down()` drops the three tables. `homecategory` is never dropped, so down is
   lossless.

Entities registered in `src/config/db.config.ts`.

## Admin panel

New page `src/Pages/AdminMerchandising.tsx` in the Vite admin, routed in
`App.tsx`, linked from `AdminSidebar` under a **Catalog** group
(Categories / Sub Categories / Merchandising).

Layout:

- Placement `<select>` at top, sourced from `GET /api/placements`.
- Tabs: **Categories** | **Sub Categories**.
- Search box (client-side filter on name — the list per placement is small).
- Filter chips: All / Visible / Hidden / Featured / Pinned / Not in placement.
- Row: name, image thumb, `▲ ▼ ⤒ ⤓` reorder buttons, visible/featured/pinned
  toggles, remove button.
- Unassigned categories render in a muted "Not in placement" group with an Add button.
- **Save Changes** button, enabled only when order is dirty; sends one
  `PATCH …/reorder` with the full ordered list.

Reorder semantics: buttons mutate local array order only. Toggles PATCH
immediately (they are idempotent single-field updates). Order is batched behind
Save because a reorder is a multi-row write.

Pinned rows are not reorderable across the pinned boundary in the UI: pinned
items sort above unpinned by contract, so the buttons move an item within its
own group. The server applies the same rule on read.

Data fetched with React Query, matching existing admin pages. Invalidate the
placement query key after every mutation.

## Storefront

New `lib/api/placements.ts` in the Next.js app.

| Component | Placement |
|---|---|
| `CategoryCatalogSection` (homepage) | `HOMEPAGE` |
| `Navbar` mega menu | `MEGA_MENU` |
| Shop page category grid | `CATEGORY_GRID` |

**Fallback rule:** if a placement returns zero rows, the component falls back to
`GET /api/categories` and renders everything. This prevents a blank homepage or
empty mega menu before anyone has configured placements, and on any placement
misconfiguration later.

`featured` is exposed to components so a featured category can render a large
card; the initial rewire preserves each component's current visual treatment and
only changes the data source and ordering.

## Error handling

Uses the existing `src/errors` classes and `globalErrorHandler`:

- Unknown/inactive placement code → `NotFoundError`
- Unknown category/subcategory id → `NotFoundError`
- Duplicate add → `ConflictError`
- Malformed body / reorder ids not in placement → `ValidationError` / `BadRequestError`

Request bodies validated with zod schemas in
`src/utils/zod_validations/merchandising.zod.ts`, matching the category module.

## Testing

The backend has no test framework (`npm test` is a stub). It does have a
self-check convention: `src/scripts/fcm.selfcheck.ts` run via `npm run check:fcm`.
Follow it — `src/scripts/merchandising.selfcheck.ts`, `npm run check:merch`,
`assert`-based, covering:

1. Sort contract: pinned rows precede unpinned; `displayOrder` ascending within
   each group; equal `displayOrder` breaks by id.
2. Reorder is atomic: a payload containing an id not in the placement writes
   nothing.

These are the two pieces of non-trivial logic. CRUD passthrough is not tested.

## Scalability

- Catalog data separated from presentation; adding a surface adds rows, not columns.
- One index per placement table covers the whole public read path.
- The same category participates in N placements with independent ordering.
- Merchandising writes never touch catalog tables, so category edits and
  merchandising edits cannot contend.

## Out of scope

Drag-and-drop, scheduling, bulk multi-select actions, audit log, preview mode,
category `slug`/`icon`/`parentId`/`status`/`description` fields (the spec's ideal
Category shape — the existing entity has `name`/`image` only, and extending it is
a separate catalog change unrelated to merchandising).
