import { Request, Response, NextFunction } from "express";
import { SubcategoryService } from "../service/subcategory.service";
import { ICreateSubcategoryRequest, IUpdateSubcategoryRequest, ISubcategoryIdParams } from "../interface/subcategory.interface";
import { AuthRequest } from "../middlewares/auth.middleware";
import { createSubCategorySchema, updateSubcategorySchema } from "../utils/zod_validations/subcategory.zod";
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from "../errors";

export class SubcategoryController {
    private subcategoryService: SubcategoryService;

    constructor() {
        this.subcategoryService = new SubcategoryService();
    }

    async createSubcategory(req: AuthRequest<{ categoryId: number }, {}, ICreateSubcategoryRequest>, res: Response, next: NextFunction): Promise<void> {
        const parsed = createSubCategorySchema.safeParse(req.body);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", parsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message }))));
        }
        const categoryId = Number(req.params.categoryId);
        if (isNaN(categoryId)) return next(new BadRequestError("Invalid category ID"));

        const doesExists = await this.subcategoryService.getSubcategoryByName(req.body.name);
        if (doesExists) throw new ConflictError(`Subcategory with name ${req.body.name} already exists`);

        const file = req.file as Express.Multer.File | undefined;
        const subcategory = await this.subcategoryService.createSubcategory(parsed.data, categoryId, req.user!.id, file);
        res.status(201).json({ success: true, data: subcategory });
    }

    async getSubcategories(req: Request<{ categoryId: number }>, res: Response, next: NextFunction): Promise<void> {
        const categoryId = req.params.categoryId;
        if (isNaN(categoryId)) return next(new BadRequestError("Invalid category ID"));

        const subcategories = await this.subcategoryService.getSubcategories(categoryId);
        res.status(200).json({ success: true, data: subcategories });
    }

    async getSubcategoryById(req: Request<ISubcategoryIdParams>, res: Response, next: NextFunction): Promise<void> {
        const { id, categoryId } = req.params;
        if (isNaN(id) || isNaN(categoryId)) return next(new BadRequestError("Invalid subcategory or category ID"));

        const subcategory = await this.subcategoryService.getSubcategoryById(id, categoryId);
        if (!subcategory) throw new NotFoundError("Subcategory");

        res.status(200).json({ success: true, data: subcategory });
    }

    async updateSubcategory(req: AuthRequest<ISubcategoryIdParams, {}, IUpdateSubcategoryRequest>, res: Response, next: NextFunction): Promise<void> {
        const parsed = updateSubcategorySchema.safeParse(req.body);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", parsed.error.errors.map(e => ({ field: e.path.join("."), message: e.message }))));
        }
        const { id, categoryId } = req.params;
        const subcategoryId = Number(id);
        const catId = Number(categoryId);
        if (isNaN(subcategoryId) || isNaN(catId)) return next(new BadRequestError("Invalid subcategory or category ID"));

        const file = req.file as Express.Multer.File | undefined;
        const subcategory = await this.subcategoryService.updateSubcategory(subcategoryId, parsed.data, catId, req.user!.id, file);
        res.status(200).json({ success: true, data: subcategory });
    }

    async deleteSubcategory(req: AuthRequest<ISubcategoryIdParams>, res: Response, next: NextFunction): Promise<void> {
        const { id, categoryId } = req.params;
        const subcategoryId = Number(id);
        const catId = Number(categoryId);
        if (isNaN(subcategoryId) || isNaN(catId)) return next(new BadRequestError("Invalid subcategory or category ID"));

        await this.subcategoryService.deleteSubcategory(subcategoryId, catId, req.user!.id);
        res.status(200).json({ success: true, message: "Subcategory deleted" });
    }
}
