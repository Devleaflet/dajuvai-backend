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

        const assigned = sortPlacementRows(placementRows)
            .map((row) => {
                const category = categories.find((item) => item.id === row.categoryId);
                if (!category) return null;
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
            })
            .filter((row): row is AdminCategoryRow => row !== null);

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

        const assigned = sortPlacementRows(placementRows)
            .map((row) => {
                const subcategory = subcategories.find((item) => item.id === row.subcategoryId);
                if (!subcategory) return null;
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
            })
            .filter((row): row is AdminSubcategoryRow => row !== null);

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
