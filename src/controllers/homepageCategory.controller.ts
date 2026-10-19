import { Request, Response, NextFunction } from "express";
import { CategoryService } from "../service/category.service";
import { HomepageCategoryService } from "../service/homepageCategory.service";
import { BadRequestError, NotFoundError } from "../errors";

export class HomepageCategoryController {
    private categoryService = new CategoryService();
    private homepageCategoryService = new HomepageCategoryService();

    async setHomepageCategories(req: Request<{}, {}, { categoryId: number[] }, {}>, res: Response, next: NextFunction) {
        const categoryIds = req.body.categoryId;
        if (categoryIds.length > 5) throw new BadRequestError("You can only select up to 5 categories");

        for (const id of categoryIds) {
            const categoryExists = await this.categoryService.getCategoryById(id);
            if (!categoryExists) throw new NotFoundError("Category");
        }

        const categories = await this.homepageCategoryService.replaceHomepageCategories(categoryIds);
        res.status(201).json({ success: true, data: categories });
    }

    async getHomepageCategories(_req: Request, res: Response, _next: NextFunction) {
        const categories = await this.homepageCategoryService.getHomepageCategories();
        res.status(200).json({ success: true, data: categories });
    }
}
