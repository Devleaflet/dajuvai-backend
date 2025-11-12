

// export interface IProductIdParams {
//     categoryId: number;
//     subcategoryId: number;
//     id: number;
// }

// export interface IProductImageParams extends IProductIdParams {
//     imageUrl: string;
// }

export interface IProductQueryParams {
    brandId?: number;
    categoryId?: number;
    subcategoryId?: number;
    dealId?: number;
    sort?: 'all' | 'low-to-high' | 'high-to-low';
    bannerId?: number
    page: number;
    limit: number;
    isAdmin?: boolean;
    search?: string;
}

export interface IAdminProductQueryParams {
    page?: number;
    limit?: number;

    // Sorting options
    sort?: 'createdAt' | 'name' | 'oldest' | 'newest' | 'price_low_high' | 'price_high_low';

    // Filtering options
    filter?: 'out_of_stock';
}

export interface IVendorProductQueryParams {
    page?: number;
    limit?: number;
}