import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { merchandisingService, PlacementTarget } from "../service/merchandising.service";
import { BadRequestError, ValidationError } from "../errors";
import {
    placementCodeSchema,
    addCategoryToPlacementSchema,
    addSubcategoryToPlacementSchema,
    updatePlacementConfigSchema,
    reorderCategoriesSchema,
    reorderSubcategoriesSchema,
} from "../utils/zod_validations/merchandising.zod";

type CodeParams = { code: string };
type TargetParams = CodeParams & { targetId: string };

const zodErrors = (error: { errors: { path: (string | number)[]; message: string }[] }) =>
    error.errors.map((issue) => ({ field: issue.path.join("."), message: issue.message }));

export class MerchandisingController {
    /** Placement codes arrive from the URL; normalise and validate before use. */
    private code(raw: string): string {
        const parsed = placementCodeSchema.safeParse(raw?.toUpperCase());
        if (!parsed.success) throw new BadRequestError("Invalid placement code");
        return parsed.data;
    }

    private targetId(raw: string): number {
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0) throw new BadRequestError("Invalid id");
        return id;
    }

    async listPlacements(_req: Request, res: Response, _next: NextFunction): Promise<void> {
        const placements = await merchandisingService.listPlacements();
        res.status(200).json({
            success: true,
            data: placements.map((placement) => ({
                code: placement.code,
                label: placement.label,
                sortOrder: placement.sortOrder,
            })),
        });
    }

    async getPublicCategories(req: Request<CodeParams>, res: Response, _next: NextFunction): Promise<void> {
        const data = await merchandisingService.getPublicCategories(this.code(req.params.code));
        res.status(200).json({ success: true, data });
    }

    async getPublicSubcategories(req: Request<CodeParams>, res: Response, _next: NextFunction): Promise<void> {
        const data = await merchandisingService.getPublicSubcategories(this.code(req.params.code));
        res.status(200).json({ success: true, data });
    }

    async getAdminCategories(req: AuthRequest<CodeParams>, res: Response, _next: NextFunction): Promise<void> {
        const data = await merchandisingService.getAdminCategories(this.code(req.params.code));
        res.status(200).json({ success: true, data });
    }

    async getAdminSubcategories(req: AuthRequest<CodeParams>, res: Response, _next: NextFunction): Promise<void> {
        const data = await merchandisingService.getAdminSubcategories(this.code(req.params.code));
        res.status(200).json({ success: true, data });
    }

    private async add(
        target: PlacementTarget,
        code: string,
        body: unknown,
        next: NextFunction,
    ): Promise<boolean> {
        const schema = target === "category" ? addCategoryToPlacementSchema : addSubcategoryToPlacementSchema;
        const parsed = schema.safeParse(body);
        if (!parsed.success) {
            next(new ValidationError("Validation failed", zodErrors(parsed.error)));
            return false;
        }
        const targetId =
            target === "category"
                ? (parsed.data as { categoryId: number }).categoryId
                : (parsed.data as { subcategoryId: number }).subcategoryId;
        await merchandisingService.addToPlacement(target, code, targetId);
        return true;
    }

    async addCategory(req: AuthRequest<CodeParams>, res: Response, next: NextFunction): Promise<void> {
        const code = this.code(req.params.code);
        if (await this.add("category", code, req.body, next)) {
            res.status(201).json({ success: true, data: await merchandisingService.getAdminCategories(code) });
        }
    }

    async addSubcategory(req: AuthRequest<CodeParams>, res: Response, next: NextFunction): Promise<void> {
        const code = this.code(req.params.code);
        if (await this.add("subcategory", code, req.body, next)) {
            res.status(201).json({ success: true, data: await merchandisingService.getAdminSubcategories(code) });
        }
    }

    async removeCategory(req: AuthRequest<TargetParams>, res: Response, _next: NextFunction): Promise<void> {
        await merchandisingService.removeFromPlacement(
            "category",
            this.code(req.params.code),
            this.targetId(req.params.targetId),
        );
        res.status(200).json({ success: true, message: "Removed from placement" });
    }

    async removeSubcategory(req: AuthRequest<TargetParams>, res: Response, _next: NextFunction): Promise<void> {
        await merchandisingService.removeFromPlacement(
            "subcategory",
            this.code(req.params.code),
            this.targetId(req.params.targetId),
        );
        res.status(200).json({ success: true, message: "Removed from placement" });
    }

    private async update(
        target: PlacementTarget,
        req: AuthRequest<TargetParams>,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        const parsed = updatePlacementConfigSchema.safeParse(req.body);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", zodErrors(parsed.error)));
        }
        await merchandisingService.updateConfig(
            target,
            this.code(req.params.code),
            this.targetId(req.params.targetId),
            parsed.data,
        );
        res.status(200).json({ success: true, message: "Placement updated" });
    }

    async updateCategory(req: AuthRequest<TargetParams>, res: Response, next: NextFunction): Promise<void> {
        await this.update("category", req, res, next);
    }

    async updateSubcategory(req: AuthRequest<TargetParams>, res: Response, next: NextFunction): Promise<void> {
        await this.update("subcategory", req, res, next);
    }

    async reorderCategories(req: AuthRequest<CodeParams>, res: Response, next: NextFunction): Promise<void> {
        const parsed = reorderCategoriesSchema.safeParse(req.body);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", zodErrors(parsed.error)));
        }
        const code = this.code(req.params.code);
        await merchandisingService.reorder(
            "category",
            code,
            parsed.data.map((item) => ({ targetId: item.categoryId, displayOrder: item.displayOrder })),
        );
        res.status(200).json({ success: true, data: await merchandisingService.getAdminCategories(code) });
    }

    async reorderSubcategories(req: AuthRequest<CodeParams>, res: Response, next: NextFunction): Promise<void> {
        const parsed = reorderSubcategoriesSchema.safeParse(req.body);
        if (!parsed.success) {
            return next(new ValidationError("Validation failed", zodErrors(parsed.error)));
        }
        const code = this.code(req.params.code);
        await merchandisingService.reorder(
            "subcategory",
            code,
            parsed.data.map((item) => ({ targetId: item.subcategoryId, displayOrder: item.displayOrder })),
        );
        res.status(200).json({ success: true, data: await merchandisingService.getAdminSubcategories(code) });
    }
}
