import { CreateCategoryInput, UpdateCategoryInput } from "../utils/zod_validations/category.zod";

export interface ICreateCategoryRequest extends CreateCategoryInput { }
export interface IUpdateCategoryRequest extends UpdateCategoryInput { }

export interface ICategoryIdParams {
    id: number;
}