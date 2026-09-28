import AppDataSource from "../config/db.config";
import { Product } from "../entities/product.entity";
import { applyPublicCatalogVisibility } from "../search/catalog-visibility";

export interface SitemapEntry {
    slug: string;
    updatedAt: string | null;
}

export interface SitemapData {
    products: SitemapEntry[];
    stores: SitemapEntry[];
    categories: SitemapEntry[];
    sections: SitemapEntry[];
}

const toEntries = (rows: { slug: string; updatedAt: Date | string | null }[]): SitemapEntry[] =>
    rows.map((row) => ({
        slug: row.slug,
        updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null,
    }));

/**
 * Every public page's slug, for the storefront's sitemap.xml.
 *
 * Products follow the catalogue's own visibility rule, so a delisted vendor's
 * listings are never advertised to crawlers; stores are the approved and
 * verified vendors; sections are the active ones.
 */
export async function getSitemapData(): Promise<SitemapData> {
    const [products, stores, categories, sections] = await Promise.all([
        applyPublicCatalogVisibility(
            AppDataSource.getRepository(Product)
                .createQueryBuilder("product")
                .select("product.slug", "slug")
                .addSelect("product.updatedAt", "updatedAt"),
        )
            .orderBy("product.id")
            .getRawMany(),
        AppDataSource.query(
            `SELECT slug, "updatedAt" FROM vendor WHERE "isApproved" = TRUE AND "isVerified" = TRUE ORDER BY id`,
        ),
        AppDataSource.query(`SELECT slug, "updatedAt" FROM category ORDER BY id`),
        AppDataSource.query(`SELECT slug, NULL AS "updatedAt" FROM homepage_section WHERE "isActive" = TRUE ORDER BY id`),
    ]);

    return {
        products: toEntries(products),
        stores: toEntries(stores),
        categories: toEntries(categories),
        sections: toEntries(sections),
    };
}
