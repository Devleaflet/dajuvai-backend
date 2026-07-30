// export interface IProductIdParams {
//     categoryId: number;
//     subcategoryId: number;
//     id: number;
// }

// export interface IProductImageParams extends IProductIdParams {
//     imageUrl: string;
// }

export type CatalogSort =
    | "newest"
    | "relevance"
    | "rating"
    | "price_low_high"
    | "price_high_low"
    | "discount_high_low"
    | "best_selling";

export interface IProductQueryParams {
    /** Legacy single-value aliases retained for older internal callers. */
    categoryId?: number;
    subcategoryId?: number;
    categoryIds?: number[];
    subcategoryIds?: number[];
    minPrice?: number;
    maxPrice?: number;
    minRating?: number;
    hasDeal?: boolean;
    dealIds?: number[];
    dealId?: number;
    sort?: CatalogSort | "all" | "low-to-high" | "high-to-low";
    bannerId?: number;
    page: number;
    limit: number;
    isAdmin?: boolean;
    search?: string;
    vendorId?: string;
}

export interface IAdminProductQueryParams {
    page?: number;
    limit?: number;

    // Sorting options
    sort?:
        | "createdAt"
        | "name"
        | "oldest"
        | "newest"
        | "price_low_high"
        | "price_high_low";

    // Filtering options
    filter?: "out_of_stock";

    vendorId?: string;
    search?: string;
}

export interface IVendorProductQueryParams {
    page?: number;
    limit?: number;
}
