import { Request, Response, NextFunction } from "express";
import { ICreateCategoryRequest, IUpdateCategoryRequest, ICategoryIdParams } from "../interface/category.interface";
import { createCategorySchema, updateCategorySchema } from "../utils/zod_validations/category.zod";
import { CategoryService } from "../service/category.service";
import { AuthRequest } from "../middlewares/auth.middleware";
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from "../errors";

export class CategoryController {
    private categoryService: CategoryService;

    constructor() {
        this.categoryService = new CategoryService();
    }

    async createCategory(req: AuthRequest<{}, {}, ICreateCategoryRequest>, res: Response, next: NextFunction): Promise<void> {
        const parsed = createCategorySchema.safeParse(req.body);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", parsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message }))));
        }
        const doesExists = await this.categoryService.getCategoryByName(req.body.name);
        if (doesExists) throw new ConflictError(`Category with the name ${req.body.name} already exists`);

        const file = req.file as Express.Multer.File | undefined;
        const category = await this.categoryService.createCategory(parsed.data, req.user!.id, file);
        res.status(201).json({ success: true, data: category });
    }

    async searchCategories(req: AuthRequest<{}, {}, {}, { name: string }>, res: Response, _next: NextFunction): Promise<void> {
        const name = req.query.name?.trim();
        const category = await this.categoryService.searchCategoryByName(name);
        res.status(200).json({ success: true, data: category });
    }

    async getCategories(_req: Request, res: Response, _next: NextFunction): Promise<void> {
        const categories = await this.categoryService.getCategories();
        res.status(200).json({ success: true, data: categories });
    }

    async getCategoryById(req: Request<ICategoryIdParams>, res: Response, next: NextFunction): Promise<void> {
        const id = req.params.id;
        if (isNaN(id)) return next(new BadRequestError("Invalid category ID"));

        const category = await this.categoryService.getCategoryById(id);
        if (!category) return next(new NotFoundError("Category"));

        res.status(200).json({ success: true, data: category });
    }

    async updateCategory(req: AuthRequest<ICategoryIdParams, {}, IUpdateCategoryRequest>, res: Response, next: NextFunction): Promise<void> {
        const parsed = updateCategorySchema.safeParse(req.body);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", parsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message }))));
        }
        const id = Number(req.params.id);
        if (isNaN(id)) return next(new BadRequestError("Invalid category ID"));

        const exists = await this.categoryService.getCategoryById(req.params.id);
        if (!exists) throw new NotFoundError("Category");

        const file = req.file as Express.Multer.File | undefined;
        const category = await this.categoryService.updateCategory(id, parsed.data, req.user!.id, file);
        if (!category) return next(new NotFoundError("Category"));

        res.status(200).json({ success: true, data: category });
    }

    async deleteCategory(req: AuthRequest<ICategoryIdParams>, res: Response, next: NextFunction): Promise<void> {
        const id = req.params.id;
        if (isNaN(id)) return next(new BadRequestError("Invalid category ID"));

        await this.categoryService.deleteCategory(id, req.user!.id);
        res.status(204).json({ success: true, message: "Category deleted" });
    }
}
