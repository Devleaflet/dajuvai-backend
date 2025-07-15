import { CreateProductInput, UpdateProductInput } from "../utils/zod_validations/product.zod";
import { DiscountType, InventoryStatus } from "../entities/product.entity";

export type ICreateProductRequest = CreateProductInput;

export interface IUpdateProductRequest extends UpdateProductInput { }

export interface IProductIdParams {
    categoryId: number;
    subcategoryId: number;
    id: number;
}

export interface IProductImageParams extends IProductIdParams {
    imageUrl: string;
}

export interface IProductQueryParams {
    brandId?: number;
    categoryId?: number;
    subcategoryId?: number;
    dealId?: number;
    sort?: 'all' | 'low-to-high' | 'high-to-low';
    bannerId?: number
}

export interface IAdminProductQueryParams {
    page?: number;
    limit?: number;
    sort?: 'createdAt' | 'name';
}

export interface IVendorProductQueryParams {
    page?: number;
    limit?: number;
}