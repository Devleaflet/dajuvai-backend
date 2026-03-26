import { Response } from 'express';
import { VendorAuthRequest } from '../middlewares/auth.middleware';
import { VendorOrdersService } from '../service/vendor.orders.service';
import { APIError } from '../utils/ApiError.utils';

export class VendorOrdersController {
    private vendorOrdersService: VendorOrdersService;

    constructor() {
        this.vendorOrdersService = new VendorOrdersService();
    }

    /**
     * Returns order page statistics for the authenticated vendor:
     * needingFulfillment, inDelivery, and completedToday.
     */
    async getOrderPageStats(req: VendorAuthRequest, res: Response): Promise<void> {
        try {
            const vendorId = req.vendor.id;
            const data = await this.vendorOrdersService.getOrderPageStats(vendorId);
            res.status(200).json({ success: true, data });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Error fetching order page stats' });
            }
        }
    }
}
