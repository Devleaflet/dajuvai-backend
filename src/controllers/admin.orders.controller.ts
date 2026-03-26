import { Response } from 'express';
import { APIError } from '../utils/ApiError.utils';
import { AdminOrdersService } from '../service/admin.orders.service';
import { AuthRequest } from '../middlewares/auth.middleware';

/**
 * @class AdminOrdersController
 * @description Handles admin order-related endpoints.
 */
export class AdminOrdersController {
    private adminOrdersService: AdminOrdersService;

    constructor() {
        this.adminOrdersService = new AdminOrdersService();
    }

    /**
     * @method getOrderPageStats
     * @description Returns aggregated order page statistics (processing orders, completed last 30 days, return/refund rate).
     * @route GET /api/admin/orders/stats
     */
    async getOrderPageStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            const data = await this.adminOrdersService.getOrderPageStats();
            res.status(200).json({ success: true, data });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error fetching order page stats',
                    error: error.message,
                });
            }
        }
    }
}
