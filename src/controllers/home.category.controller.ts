import { Request, Response } from "express";
import { APIError } from "../utils/ApiError.utils";
import { CategoryService } from "../service/category.service";
import { HomeCategoryService } from "../service/home.category.service";


export class HomeCategoryController {
    private categoryService = new CategoryService();
    private homecategoryService = new HomeCategoryService();


    async createCategoryCatalog(req: Request<{}, {}, { categoryId: number[] }, {}>, res: Response) {
        try {

            const categoryIds = req.body.categoryId;

            if (categoryIds.length > 5) {
                throw new APIError(400, "You can ony select up to 5 categories")
            }

            for (const id of categoryIds) {
                const categoryExists = await this.categoryService.getCategoryById(id);
                if (!categoryExists) {
                    throw new APIError(404, "Category doesnot exists")
                }
            }

            const category = await this.homecategoryService.handleCreateHomeCategory(categoryIds)

            res.status(201).json({
                success: true,
                data: category
            })

        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({
                    success: false,
                    msg: error.message
                })
            } else {
                //(error.stack);
                res.status(500).json({
                    success: false,
                    msg: (error as Error).message
                })
            }
        }
    }

    async getHomePageCategory(req: Request, res: Response) {
        try {
            const homepageCategory = await this.homecategoryService.getHomeCategory();
            res.status(200).json({
                success: true,
                data: homepageCategory
            })
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({
                    success: false,
                    msg: error.message
                })
            } else {
                //(error.stack);
                res.status(500).json({
                    success: false,
                    msg: (error as Error).message
                })
            }
        }
    }
}