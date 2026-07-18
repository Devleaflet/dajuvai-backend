import { VendorAuthRequest } from "../middlewares/auth.middleware";
import { VendorDashBoardService } from "../service/vendor.dashboard.service";
import { Response, NextFunction } from "express";

export class VendorDashboardController {
    private dashboardService = new VendorDashBoardService();

    async getDashboard(req: VendorAuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const stats = await this.dashboardService.getStats(req.vendor.id);
        res.status(200).json(stats);
    }

    async getVendorOrderDetails(req: VendorAuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const orderDetails = await this.dashboardService.getVendorOrders(req.vendor.id);
        res.status(200).json(orderDetails);
    }

    async vendorSalesReport(req: VendorAuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
        const report = await this.dashboardService.getTotalSales(req.vendor.id, startDate, endDate);
        res.status(200).json(report);
    }

    async getLowStockProducts(req: VendorAuthRequest, res: Response, _next: NextFunction): Promise<void> {
        let { page } = req.query as { page?: number };
        if (!page || page < 1) page = 1;
        const lowStockProducts = await this.dashboardService.getLowStockProducts(req.vendor.id, page);
        res.status(200).json(lowStockProducts);
    }

    async getTopSellingProduct(req: VendorAuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const topSellingProduct = await this.dashboardService.getTopProductsByVendor(req.vendor.id);
        res.status(200).json(topSellingProduct);
    }

    async getRevenueBySubcategoryForVendor(req: VendorAuthRequest<{}, {}, {}, { startDate?: string; endDate?: string }>, res: Response, _next: NextFunction): Promise<void> {
        const { startDate, endDate } = req.query;
        const filterParams: { startDate?: string; endDate?: string } = {};
        if (startDate) filterParams.startDate = startDate;
        if (endDate) filterParams.endDate = endDate;
        const data = await this.dashboardService.getRevenueBySubcategoryForVendor(req.vendor.id, filterParams);
        res.status(200).json({ success: true, data });
    }

    async getRevenueByCategoryForVendor(req: VendorAuthRequest<{}, {}, {}, { startDate?: string; endDate?: string }>, res: Response, _next: NextFunction): Promise<void> {
        const { startDate, endDate } = req.query;
        const filterParams: { startDate?: string; endDate?: string } = {};
        if (startDate) filterParams.startDate = startDate;
        if (endDate) filterParams.endDate = endDate;
        const data = await this.dashboardService.revenueByCategoryForVendor(req.vendor.id, filterParams);
        res.status(200).json({ success: true, data });
    }
}
