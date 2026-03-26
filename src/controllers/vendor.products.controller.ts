import { Response } from 'express';
import { VendorAuthRequest } from '../middlewares/auth.middleware';
import { VendorProductsService } from '../service/vendor.products.service';
import { APIError } from '../utils/ApiError.utils';

export class VendorProductsController {
    private vendorProductsService: VendorProductsService;

    constructor() {
        this.vendorProductsService = new VendorProductsService();
    }

    /**
     * Returns product page statistics for the authenticated vendor:
     * totalActiveProducts, outOfStockCount, and topSellingItem.
     */
    async getProductPageStats(req: VendorAuthRequest, res: Response): Promise<void> {
        try {
            const vendorId = req.vendor.id;
            const data = await this.vendorProductsService.getProductPageStats(vendorId);
            res.status(200).json({ success: true, data });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Error fetching product page stats' });
            }
        }
    }

    /**
     * Returns the most recent customer reviews across all of this vendor's products.
     * Accepts optional ?limit=N query parameter (default 10).
     */
    async getRecentReviews(req: VendorAuthRequest<{}, {}, {}, { limit: string }>, res: Response): Promise<void> {
        try {
            const vendorId = req.vendor.id;
            const limit = parseInt(req.query.limit as string) || 10;
            const data = await this.vendorProductsService.getRecentReviews(vendorId, limit);
            res.status(200).json({ success: true, data });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Error fetching recent reviews' });
            }
        }
    }
}
