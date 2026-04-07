import { Request, Response, NextFunction } from "express";
import { CategoryService } from "../service/category.service";
import { HomeCategoryService } from "../service/home.category.service";
import { BadRequestError, NotFoundError } from "../errors";

export class HomeCategoryController {
    private categoryService = new CategoryService();
    private homecategoryService = new HomeCategoryService();

    async createCategoryCatalog(req: Request<{}, {}, { categoryId: number[] }, {}>, res: Response, next: NextFunction) {
        const categoryIds = req.body.categoryId;
        if (categoryIds.length > 5) throw new BadRequestError("You can only select up to 5 categories");

        for (const id of categoryIds) {
            const categoryExists = await this.categoryService.getCategoryById(id);
            if (!categoryExists) throw new NotFoundError("Category");
        }

        const category = await this.homecategoryService.handleCreateHomeCategory(categoryIds);
        res.status(201).json({ success: true, data: category });
    }

    async getHomePageCategory(_req: Request, res: Response, _next: NextFunction) {
        const homepageCategory = await this.homecategoryService.getHomeCategory();
        res.status(200).json({ success: true, data: homepageCategory });
    }
}
