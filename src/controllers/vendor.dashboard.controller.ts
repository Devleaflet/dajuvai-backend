import { stat } from "fs";
import { VendorAuthRequest } from "../middlewares/auth.middleware";
import { VendorDashBoardService } from "../service/vendor.dashboard.service"
import { APIError } from "../utils/ApiError.utils";
import { Response } from 'express';

/**
 * Controller for vendor dashboard related endpoints.
 */
export class VendorDashboardController {
    private dashboardService = new VendorDashBoardService();

    /**
     * Retrieves dashboard statistics for the authenticated vendor.
     * 
     * @param req - VendorAuthRequest containing authenticated vendor information
     * @param res - Express response object to send JSON response
     * @returns Promise<void> - Responds with HTTP 200 and stats JSON on success,
     * or appropriate error status and message on failure.
     * 
     * @throws APIError - Throws 401 if vendor is not authenticated.
     * @throws APIError - Other errors from the dashboard service are handled and returned as JSON.
     */
    async getDashboard(req: VendorAuthRequest, res: Response): Promise<void> {
        try {
            const vendor = req.vendor;
            if (!vendor || !vendor.id) {
                throw new APIError(401, "Unauthorized");
            }

            const stats = await this.dashboardService.getStats(vendor.id);
            res.status(200).json(stats);
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * Retrieves detailed order information for the authenticated vendor.
     * 
     * @param req - VendorAuthRequest containing authenticated vendor information
     * @param res - Express response object to send JSON response
     * @returns Promise<void> - Responds with HTTP 200 and order details JSON on success,
     * or appropriate error status and message on failure.
     * 
     * @throws APIError - Throws 401 if vendor is not authenticated.
     * @throws APIError - Other errors from the dashboard service are handled and returned as JSON.
     */
    async getVendorOrderDetails(req: VendorAuthRequest, res: Response): Promise<void> {
        try {
            const vendor = req.vendor;
            if (!vendor || !vendor.id) {
                throw new APIError(401, 'Unauthorized');
            }

            const orderDetails = await this.dashboardService.getVendorOrders(vendor.id);
            res.status(200).json(orderDetails);
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    async vendorSalesReport(req: VendorAuthRequest, res: Response): Promise<void> {
        try {
            const vendor = req.vendor;
            if (!vendor || !vendor.id) {
                throw new APIError(401, 'Unauthorized');
            }

            const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };

            const report = await this.dashboardService.getTotalSales(7, startDate, endDate);
            res.status(200).json(report);
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    async getLowStockProducts(req: VendorAuthRequest, res: Response): Promise<void> {
        try {
            const vendor = req.vendor;
            if (!vendor || !vendor.id) {
                throw new APIError(401, 'Unauthorized');
            }

            let { page } = req.query as { page?: number };
            if (!page || page < 1) page = 1;

            const lowStockProducts = await this.dashboardService.getLowStockProducts(vendor.id, page);
            res.status(200).json(lowStockProducts);
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }
}
