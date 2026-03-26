import { Response } from 'express';
import { APIError } from '../utils/ApiError.utils';
import { AdminVendorsService } from '../service/admin.vendors.service';
import { AuthRequest } from '../middlewares/auth.middleware';

/**
 * @class AdminVendorsController
 * @description Handles admin vendor-related endpoints.
 */
export class AdminVendorsController {
    private adminVendorsService: AdminVendorsService;

    constructor() {
        this.adminVendorsService = new AdminVendorsService();
    }

    /**
     * @method getVendorPageStats
     * @description Returns aggregated vendor page statistics (total vendors, pending approvals, top earning vendor).
     * @route GET /api/admin/vendors/stats
     */
    async getVendorPageStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            const data = await this.adminVendorsService.getVendorPageStats();
            res.status(200).json({ success: true, data });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error fetching vendor page stats',
                    error: error.message,
                });
            }
        }
    }

    /**
     * @method getTopEarningVendor
     * @description Returns the top earning vendor for the current month.
     * @route GET /api/admin/vendors/top-earning
     */
    async getTopEarningVendor(req: AuthRequest, res: Response): Promise<void> {
        try {
            const data = await this.adminVendorsService.getTopEarningVendorThisMonth();
            res.status(200).json({ success: true, data });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error fetching top earning vendor',
                    error: error.message,
                });
            }
        }
    }
}
