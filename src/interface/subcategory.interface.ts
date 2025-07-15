import { CreateSubCategoryInput, UpdateSubCategoryInput } from "../utils/zod_validations/subcategory.zod";

export interface ICreateSubcategoryRequest extends CreateSubCategoryInput { }

export interface IUpdateSubcategoryRequest extends UpdateSubCategoryInput { }
export interface ISubcategoryIdParams {
    categoryId: number;
    id: number;
}