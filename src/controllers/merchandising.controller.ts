import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { merchandisingService } from "../service/merchandising.service";
import { BadRequestError, ValidationError } from "../errors";
import {
    placementSlugSchema,
    addItemsSchema,
    updateVisibilitySchema,
    reorderSchema,
    availableItemsQuerySchema,
} from "../utils/zod_validations/merchandising.zod";

type SlugParams = { slug: string };
type ItemParams = SlugParams & { itemId: string };

const zodErrors = (error: { errors: { path: (string | number)[]; message: string }[] }) =>
    error.errors.map((issue) => ({ field: issue.path.join("."), message: issue.message }));

export class MerchandisingController {
    private slug(raw: string): string {
        const parsed = placementSlugSchema.safeParse(raw);
        if (!parsed.success) throw new BadRequestError("Invalid placement slug");
        return parsed.data;
    }

    private itemId(raw: string): number {
        const id = Number(raw);
        if (!Number.isInteger(id) || id <= 0) throw new BadRequestError("Invalid item id");
        return id;
    }

    async listPlacements(_req: Request, res: Response): Promise<void> {
        const data = await merchandisingService.listPlacements();
        res.status(200).json({ success: true, data });
    }

    async getPlacement(req: Request<SlugParams>, res: Response): Promise<void> {
        const data = await merchandisingService.getPlacementBySlug(this.slug(req.params.slug));
        res.status(200).json({ success: true, data });
    }

    async getItems(req: AuthRequest<SlugParams>, res: Response): Promise<void> {
        const data = await merchandisingService.getItems(this.slug(req.params.slug));
        res.status(200).json({ success: true, data });
    }

    async getStorefrontMegaMenu(_req: Request, res: Response): Promise<void> {
        const data = await merchandisingService.getStorefront("mega-menu");
        res.status(200).json({ success: true, data });
    }

    async getStorefrontCategoryGrid(_req: Request, res: Response): Promise<void> {
        const data = await merchandisingService.getStorefront("category-grid");
        res.status(200).json({ success: true, data });
    }

    async addItems(req: AuthRequest<SlugParams>, res: Response, next: NextFunction): Promise<void> {
        const parsed = addItemsSchema.safeParse(req.body);
        if (!parsed.success) return next(new ValidationError("Validation failed", zodErrors(parsed.error)));

        // zod's inferred output type marks these fields optional despite the
        // schema requiring them (coerce + enum quirk); the values are always
        // present after a successful parse, so this reconstructs plain
        // required-field objects for the service call.
        const items = parsed.data.items.map((item) => ({
            entityType: item.entityType as "category" | "subcategory",
            entityId: item.entityId as number,
        }));
        const addedCount = await merchandisingService.addItems(this.slug(req.params.slug), items);
        res.status(201).json({ success: true, addedCount });
    }

    async updateVisibility(req: AuthRequest<ItemParams>, res: Response, next: NextFunction): Promise<void> {
        const parsed = updateVisibilitySchema.safeParse(req.body);
        if (!parsed.success) return next(new ValidationError("Validation failed", zodErrors(parsed.error)));

        const itemId = this.itemId(req.params.itemId);
        await merchandisingService.updateVisibility(this.slug(req.params.slug), itemId, parsed.data.visible);
        res.status(200).json({ success: true, item: { itemId, visible: parsed.data.visible } });
    }

    async removeItem(req: AuthRequest<ItemParams>, res: Response): Promise<void> {
        await merchandisingService.removeItem(this.slug(req.params.slug), this.itemId(req.params.itemId));
        res.status(200).json({ success: true });
    }

    async reorder(req: AuthRequest<SlugParams>, res: Response, next: NextFunction): Promise<void> {
        const parsed = reorderSchema.safeParse(req.body);
        if (!parsed.success) return next(new ValidationError("Validation failed", zodErrors(parsed.error)));

        const items = parsed.data.items.map((item) => ({
            itemId: item.itemId as number,
            displayOrder: item.displayOrder as number,
        }));
        await merchandisingService.reorder(this.slug(req.params.slug), items);
        res.status(200).json({ success: true, message: "Order updated successfully" });
    }

    async availableItems(req: AuthRequest<SlugParams>, res: Response, next: NextFunction): Promise<void> {
        const parsed = availableItemsQuerySchema.safeParse(req.query);
        if (!parsed.success) return next(new ValidationError("Validation failed", zodErrors(parsed.error)));

        const data = await merchandisingService.availableItems(this.slug(req.params.slug), parsed.data);
        res.status(200).json({ success: true, data });
    }
}
