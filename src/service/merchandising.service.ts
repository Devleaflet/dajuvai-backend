import { In } from "typeorm";
import AppDataSource from "../config/db.config";
import { Category } from "../entities/category.entity";
import { Subcategory } from "../entities/subcategory.entity";
import { Placement } from "../entities/placement.entity";
import { PlacementItem, PlacementEntityType } from "../entities/placementItem.entity";
import { BadRequestError, NotFoundError } from "../errors";
import { cacheGet, cacheSet, cacheInvalidate } from "../utils/merchandising.cache";

const MEGA_MENU_SLUG = "mega-menu";

export interface ReorderItem {
    itemId: number;
    displayOrder: number;
}

export interface NewItem {
    entityType: PlacementEntityType;
    entityId: number;
}

interface EntityRow {
    id: number;
    name: string;
    image: string | null;
    categoryId?: number;
}

/** Base fields every item row carries, regardless of placement shape. */
interface ItemRowBase {
    itemId: number;
    entityId: number;
    displayOrder: number;
    visible: boolean;
    name: string;
    image: string | null;
}

export interface MegaMenuSubcategoryRow extends ItemRowBase {}

export interface MegaMenuCategoryRow extends ItemRowBase {
    subcategories: MegaMenuSubcategoryRow[];
}

export interface FlatItemRow extends ItemRowBase {
    entityType: PlacementEntityType;
    categoryId: number | null;
    categoryName: string | null;
}

export type PlacementItemsResult = { categories: MegaMenuCategoryRow[] } | { items: FlatItemRow[] };

export interface PlacementSummary {
    id: number;
    name: string;
    slug: string;
    description: string | null;
    status: string;
}

/**
 * Placements: where catalog items appear, in what order, and whether they're
 * visible. Categories and subcategories carry no ordering or visibility of
 * their own - that state lives entirely in placement_items, keyed by a
 * polymorphic (entityType, entityId) pair rather than a separate join table
 * per catalog type.
 */
export class MerchandisingService {
    private placementRepo = AppDataSource.getRepository(Placement);
    private itemRepo = AppDataSource.getRepository(PlacementItem);

    async listPlacements(): Promise<PlacementSummary[]> {
        const placements = await this.placementRepo.find({ order: { id: "ASC" } });
        return placements.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            description: p.description,
            status: p.status,
        }));
    }

    async getPlacementBySlug(slug: string): Promise<PlacementSummary> {
        const placement = await this.placementRepo.findOneBy({ slug });
        if (!placement) throw new NotFoundError(`Placement ${slug}`);
        return {
            id: placement.id,
            name: placement.name,
            slug: placement.slug,
            description: placement.description,
            status: placement.status,
        };
    }

    /** Throws NotFoundError unless the placement exists. Returns the row (id needed by callers). */
    private async assertPlacement(slug: string): Promise<Placement> {
        const placement = await this.placementRepo.findOneBy({ slug });
        if (!placement) throw new NotFoundError(`Placement ${slug}`);
        return placement;
    }

    private async lookupEntities(
        entityType: PlacementEntityType,
        ids: number[],
    ): Promise<Map<number, EntityRow>> {
        if (ids.length === 0) return new Map();
        if (entityType === "category") {
            const rows = await AppDataSource.getRepository(Category).find({ where: { id: In(ids) } });
            return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, image: r.image ?? null }]));
        }
        const rows = await AppDataSource.getRepository(Subcategory).find({
            where: { id: In(ids) },
            relations: { category: true },
        });
        return new Map(
            rows.map((r) => [
                r.id,
                { id: r.id, name: r.name, image: r.image ?? null, categoryId: r.category?.id },
            ]),
        );
    }

    /**
     * Admin+storefront share this builder. onlyVisible=true is the storefront
     * contract: an empty/all-hidden placement renders nothing rather than
     * falling back to the full catalog.
     */
    private async buildItems(placement: Placement, onlyVisible: boolean): Promise<PlacementItemsResult> {
        const where: Record<string, unknown> = { placementId: placement.id };
        if (onlyVisible) where.visible = true;

        const rows = await this.itemRepo.find({
            where: where as any,
            order: { displayOrder: "ASC", id: "ASC" },
        });

        if (placement.slug === MEGA_MENU_SLUG) {
            const categoryRows = rows.filter((r) => r.entityType === "category");
            const subcategoryRows = rows.filter((r) => r.entityType === "subcategory");

            const categoryEntities = await this.lookupEntities("category", categoryRows.map((r) => r.entityId));
            const subcategoryEntities = await this.lookupEntities(
                "subcategory",
                subcategoryRows.map((r) => r.entityId),
            );

            const categories: MegaMenuCategoryRow[] = categoryRows
                .map((row) => {
                    const entity = categoryEntities.get(row.entityId);
                    if (!entity) return null;
                    return {
                        itemId: row.id,
                        entityId: row.entityId,
                        displayOrder: row.displayOrder,
                        visible: row.visible,
                        name: entity.name,
                        image: entity.image,
                        subcategories: [] as MegaMenuSubcategoryRow[],
                    };
                })
                .filter((row): row is MegaMenuCategoryRow => row !== null);

            const byCategoryEntityId = new Map(categories.map((c) => [c.entityId, c]));
            for (const row of subcategoryRows) {
                const entity = subcategoryEntities.get(row.entityId);
                if (!entity || entity.categoryId === undefined) continue;
                const parent = byCategoryEntityId.get(entity.categoryId);
                if (!parent) continue;
                parent.subcategories.push({
                    itemId: row.id,
                    entityId: row.entityId,
                    displayOrder: row.displayOrder,
                    visible: row.visible,
                    name: entity.name,
                    image: entity.image,
                });
            }

            return { categories };
        }

        const categoryEntities = await this.lookupEntities(
            "category",
            rows.filter((r) => r.entityType === "category").map((r) => r.entityId),
        );
        const subcategoryEntities = await this.lookupEntities(
            "subcategory",
            rows.filter((r) => r.entityType === "subcategory").map((r) => r.entityId),
        );

        const parentNames = new Map<number, string>();
        for (const entity of subcategoryEntities.values()) {
            if (entity.categoryId !== undefined && !parentNames.has(entity.categoryId)) {
                const parentCategory = await AppDataSource.getRepository(Category).findOneBy({
                    id: entity.categoryId,
                });
                if (parentCategory) parentNames.set(entity.categoryId, parentCategory.name);
            }
        }

        const items: FlatItemRow[] = rows
            .map((row) => {
                const entity =
                    row.entityType === "category"
                        ? categoryEntities.get(row.entityId)
                        : subcategoryEntities.get(row.entityId);
                if (!entity) return null;
                return {
                    itemId: row.id,
                    entityId: row.entityId,
                    entityType: row.entityType,
                    displayOrder: row.displayOrder,
                    visible: row.visible,
                    name: entity.name,
                    image: entity.image,
                    categoryId: entity.categoryId ?? null,
                    categoryName: entity.categoryId !== undefined ? parentNames.get(entity.categoryId) ?? null : null,
                };
            })
            .filter((row): row is FlatItemRow => row !== null);

        return { items };
    }

    async getItems(slug: string): Promise<PlacementItemsResult> {
        const placement = await this.assertPlacement(slug);
        return this.buildItems(placement, false);
    }

    async getStorefront(slug: string): Promise<PlacementItemsResult> {
        const cacheKey = `storefront:${slug}`;
        const cached = cacheGet<PlacementItemsResult>(cacheKey);
        if (cached) return cached;

        const placement = await this.assertPlacement(slug);
        const result = await this.buildItems(placement, true);
        cacheSet(cacheKey, result);
        return result;
    }

    async addItems(slug: string, newItems: NewItem[]): Promise<number> {
        const placement = await this.assertPlacement(slug);

        const maxByType = new Map<PlacementEntityType, number>();
        let addedCount = 0;

        for (const { entityType, entityId } of newItems) {
            const entity = (await this.lookupEntities(entityType, [entityId])).get(entityId);
            if (!entity) continue; // unknown category/subcategory: silently skipped, like a duplicate

            const already = await this.itemRepo.findOneBy({
                placementId: placement.id,
                entityType,
                entityId,
            });
            if (already) continue;

            if (!maxByType.has(entityType)) {
                const last = await this.itemRepo.findOne({
                    where: { placementId: placement.id, entityType },
                    order: { displayOrder: "DESC" },
                });
                maxByType.set(entityType, last ? last.displayOrder + 1 : 0);
            }
            const nextOrder = maxByType.get(entityType)!;
            maxByType.set(entityType, nextOrder + 1);

            await this.itemRepo.save(
                this.itemRepo.create({
                    placementId: placement.id,
                    entityType,
                    entityId,
                    displayOrder: nextOrder,
                    visible: true,
                }),
            );
            addedCount += 1;
        }

        if (addedCount > 0) cacheInvalidate(`storefront:${slug}`);
        return addedCount;
    }

    async updateVisibility(slug: string, itemId: number, visible: boolean): Promise<void> {
        const placement = await this.assertPlacement(slug);
        const row = await this.itemRepo.findOneBy({ id: itemId, placementId: placement.id });
        if (!row) throw new NotFoundError(`Item ${itemId} in placement ${slug}`);

        row.visible = visible;
        await this.itemRepo.save(row);
        cacheInvalidate(`storefront:${slug}`);
    }

    /** Deletes the placement row only; leaves gaps in displayOrder, which sort correctly. */
    async removeItem(slug: string, itemId: number): Promise<void> {
        const placement = await this.assertPlacement(slug);
        const result = await this.itemRepo.delete({ id: itemId, placementId: placement.id });
        if (!result.affected) throw new NotFoundError(`Item ${itemId} in placement ${slug}`);
        cacheInvalidate(`storefront:${slug}`);
    }

    /**
     * Applies a whole ordering in one transaction. An itemId that isn't in
     * this placement writes nothing, rather than reordering the half it
     * recognised and leaving the list scrambled.
     */
    async reorder(slug: string, items: ReorderItem[]): Promise<void> {
        const placement = await this.assertPlacement(slug);

        await AppDataSource.transaction(async (manager) => {
            const repo = manager.getRepository(PlacementItem);
            const existing = await repo.findBy({ placementId: placement.id });
            const known = new Set(existing.map((row) => row.id));

            const unknown = items.filter((item) => !known.has(item.itemId));
            if (unknown.length > 0) {
                throw new BadRequestError(
                    `Item ids ${unknown.map((item) => item.itemId).join(", ")} not in placement ${slug}`,
                );
            }

            for (const item of items) {
                await repo.update(
                    { id: item.itemId, placementId: placement.id },
                    { displayOrder: item.displayOrder },
                );
            }
        });

        cacheInvalidate(`storefront:${slug}`);
    }

    /**
     * Items not yet in this placement, for the admin "Add Items" picker.
     * Category Grid: subcategories, grouped by parent category. Mega Menu: a
     * flat list of categories, or (with categoryId) the subcategories of one
     * category - both scoped to what's not already placed.
     */
    async availableItems(
        slug: string,
        opts: { entityType?: PlacementEntityType; categoryId?: number },
    ): Promise<
        | { groups: { categoryId: number; categoryName: string; subcategories: EntityRow[] }[] }
        | { items: EntityRow[] }
    > {
        const placement = await this.assertPlacement(slug);

        const placedIds = async (entityType: PlacementEntityType) => {
            const rows = await this.itemRepo.find({ where: { placementId: placement.id, entityType } });
            return new Set(rows.map((r) => r.entityId));
        };

        if (slug !== MEGA_MENU_SLUG || opts.entityType === "subcategory" || (!opts.entityType && opts.categoryId)) {
            // category-grid, or mega-menu scoped to one category's subcategories
            const placed = await placedIds("subcategory");
            const subcategories = await AppDataSource.getRepository(Subcategory).find({
                relations: { category: true },
                order: { name: "ASC" },
            });
            const available = subcategories.filter((sc) => !placed.has(sc.id));

            if (opts.categoryId) {
                const scoped = available.filter((sc) => sc.category?.id === opts.categoryId);
                return {
                    items: scoped.map((sc) => ({ id: sc.id, name: sc.name, image: sc.image ?? null })),
                };
            }

            const groups = new Map<number, { categoryId: number; categoryName: string; subcategories: EntityRow[] }>();
            for (const sc of available) {
                if (!sc.category) continue;
                if (!groups.has(sc.category.id)) {
                    groups.set(sc.category.id, {
                        categoryId: sc.category.id,
                        categoryName: sc.category.name,
                        subcategories: [],
                    });
                }
                groups.get(sc.category.id)!.subcategories.push({ id: sc.id, name: sc.name, image: sc.image ?? null });
            }
            return { groups: [...groups.values()].sort((a, b) => a.categoryName.localeCompare(b.categoryName)) };
        }

        // mega-menu, categories not yet placed
        const placed = await placedIds("category");
        const categories = await AppDataSource.getRepository(Category).find({ order: { name: "ASC" } });
        return {
            items: categories
                .filter((c) => !placed.has(c.id))
                .map((c) => ({ id: c.id, name: c.name, image: c.image ?? null })),
        };
    }

    /**
     * Replaces the whole category set for a placement, ordered by array
     * position. Exists only to back the legacy /api/home/category/section
     * endpoint (see homepageCategory.service.ts) - the new Arrangements UI
     * uses add/remove/reorder instead.
     */
    async replaceCategorySet(slug: string, categoryIds: number[]): Promise<void> {
        const placement = await this.assertPlacement(slug);

        if (categoryIds.length > 0) {
            const found = await AppDataSource.getRepository(Category).find({ where: { id: In(categoryIds) } });
            if (found.length !== new Set(categoryIds).size) throw new NotFoundError("Category");
        }

        await AppDataSource.transaction(async (manager) => {
            const repo = manager.getRepository(PlacementItem);
            const existing = await repo.findBy({ placementId: placement.id, entityType: "category" });
            const byEntityId = new Map(existing.map((row) => [row.entityId, row]));

            const removed = existing.filter((row) => !categoryIds.includes(row.entityId));
            if (removed.length > 0) await repo.remove(removed);

            const rows = categoryIds.map((entityId, index) => {
                const row = byEntityId.get(entityId);
                if (row) {
                    row.displayOrder = index;
                    return row;
                }
                return repo.create({
                    placementId: placement.id,
                    entityType: "category" as const,
                    entityId,
                    displayOrder: index,
                    visible: true,
                });
            });

            if (rows.length > 0) await repo.save(rows);
        });

        cacheInvalidate(`storefront:${slug}`);
    }

    /**
     * Categories in a placement, each with its FULL subcategory list (not
     * filtered by placement membership). Backs the legacy homepage-category
     * endpoint, whose response shape predates per-subcategory placement.
     */
    async getCategoriesWithSubcategories(slug: string): Promise<
        { categoryId: number; name: string; image: string | null; subcategories: EntityRow[] }[]
    > {
        const placement = await this.assertPlacement(slug);
        const rows = await this.itemRepo.find({
            where: { placementId: placement.id, entityType: "category" },
            order: { displayOrder: "ASC", id: "ASC" },
        });

        const categories = await AppDataSource.getRepository(Category).find({
            where: { id: In(rows.map((r) => r.entityId)) },
            relations: { subcategories: true },
        });
        const byId = new Map(categories.map((c) => [c.id, c]));

        return rows
            .map((row) => {
                const category = byId.get(row.entityId);
                if (!category) return null;
                return {
                    categoryId: category.id,
                    name: category.name,
                    image: category.image ?? null,
                    subcategories: (category.subcategories ?? []).map((sc) => ({
                        id: sc.id,
                        name: sc.name,
                        image: sc.image ?? null,
                    })),
                };
            })
            .filter((row): row is NonNullable<typeof row> => row !== null);
    }
}

export const merchandisingService = new MerchandisingService();
