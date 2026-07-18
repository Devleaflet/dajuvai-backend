import { merchandisingService } from "./merchandising.service";

/**
 * Legacy homepage-category endpoint, now a thin adapter over the 'homepage'
 * placement. The response shape is frozen: storefront and admin clients still
 * consume it, so this must keep returning [{ id, category: { … } }].
 *
 * This placement is not managed from the Arrangements admin UI - it exists
 * only so this endpoint keeps working.
 */
const HOMEPAGE_SLUG = "homepage";

export class HomepageCategoryService {
    async replaceHomepageCategories(categoryIds: number[]) {
        await merchandisingService.replaceCategorySet(HOMEPAGE_SLUG, categoryIds);
        return this.getHomepageCategories();
    }

    async getHomepageCategories() {
        const rows = await merchandisingService.getCategoriesWithSubcategories(HOMEPAGE_SLUG);

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
