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
    async handleCreateHomeCategory(id: number[]) {
        await merchandisingService.replacePlacementSet("category", HOMEPAGE, id);
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
