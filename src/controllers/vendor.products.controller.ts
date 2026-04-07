import { Response, NextFunction } from "express";
import { VendorAuthRequest } from "../middlewares/auth.middleware";
import { VendorProductsService } from "../service/vendor.products.service";

export class VendorProductsController {
    private vendorProductsService: VendorProductsService;

    constructor() {
        this.vendorProductsService = new VendorProductsService();
    }

    async getProductPageStats(req: VendorAuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const data = await this.vendorProductsService.getProductPageStats(req.vendor.id);
        res.status(200).json({ success: true, data });
    }

    async getRecentReviews(req: VendorAuthRequest<{}, {}, {}, { limit: string }>, res: Response, _next: NextFunction): Promise<void> {
        const limit = parseInt(req.query.limit as string) || 10;
        const data = await this.vendorProductsService.getRecentReviews(req.vendor.id, limit);
        res.status(200).json({ success: true, data });
    }
}
