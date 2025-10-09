import { ProductSource } from "../entities/banner.entity";

export interface ICreateHomepageSectionInput {
    title: string;
    isActive?: boolean;
    productSource: ProductSource;

    // optional based on productSource
    productIds?: number[];          // MANUAL
    selectedCategoryId?: number;    // CATEGORY
    selectedSubcategoryId?: number; // SUBCATEGORY
    selectedDealId?: number;        // DEAL
}

export interface IUpdateHomePageSectionInput {
    sectionId: number;
    title?: string;
    isActive?: boolean;
    productSource?: ProductSource;

    // optional based on productSource
    productIds?: number[];
    selectedCategoryId?: number;
    selectedSubcategoryId?: number;
    selectedDealId?: number;
}