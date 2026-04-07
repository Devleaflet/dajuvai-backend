import { Response, NextFunction } from "express";
import { AdminDashBoardService } from "../service/admin.dashboard.service";
import { AuthRequest } from "../middlewares/auth.middleware";

export class AdminDashboardController {
    private adminDashboardService: AdminDashBoardService;

    constructor() {
        this.adminDashboardService = new AdminDashBoardService();
    }

    async getDashboardStats(_req: AuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const stats = await this.adminDashboardService.getDashboardStats();
        res.status(200).json({ success: true, data: stats });
    }

    async getRevenueChart(req: AuthRequest<{}, {}, {}, { days: string }>, res: Response, _next: NextFunction): Promise<void> {
        const days = parseInt(req.query.days as string) || 7;
        const chartData = await this.adminDashboardService.getRevenueChart(days);
        res.status(200).json(chartData);
    }

    async getVendorsSalesAmount(req: AuthRequest, res: Response, _next: NextFunction) {
        let { startDate, endDate, page } = req.query as { startDate?: string; endDate?: string; page?: number };
        if (!page || page < 1) page = 1;
        const data = await this.adminDashboardService.getVendorsSalesAmount(startDate, endDate, page);
        res.status(200).json({ success: true, data });
    }

    async getTopProducts(req: AuthRequest, res: Response, _next: NextFunction) {
        let { startDate, endDate, page } = req.query as { startDate?: string; endDate?: string; page?: number };
        if (!page || page < 1) page = 1;
        const data = await this.adminDashboardService.getTopProducts(startDate, endDate, page);
        res.status(200).json({ success: true, data });
    }

    async getTodaysSales(_req: AuthRequest, res: Response, _next: NextFunction) {
        const data = await this.adminDashboardService.getTodayTotalSales();
        res.status(200).json({ success: true, data });
    }

    async getRevenueByCategory(req: AuthRequest<{}, {}, {}, { startDate: string; endDate: string }>, res: Response, _next: NextFunction) {
        const { startDate, endDate } = req.query;
        const data = await this.adminDashboardService.getRevenueByCategory(startDate, endDate);
        res.status(200).json({ success: true, data });
    }

    async getRevenueBySubCategory(req: AuthRequest<{}, {}, {}, { startDate: string; endDate: string }>, res: Response, _next: NextFunction) {
        const { startDate, endDate } = req.query;
        const data = await this.adminDashboardService.getRevenueBySubcategory(startDate, endDate);
        res.status(200).json({ success: true, data });
    }

    async getRevenueByVendor(_req: AuthRequest, res: Response, _next: NextFunction) {
        const data = await this.adminDashboardService.getRevenueByVendor();
        res.status(200).json({ success: true, data });
    }

    async getTotalShippingRevenue(req: AuthRequest<{}, {}, {}, { startDate: string; endDate: string }>, res: Response, _next: NextFunction) {
        const { startDate, endDate } = req.query;
        const data = await this.adminDashboardService.getTotalShippingRevenue(startDate, endDate);
        res.status(200).json({ data });
    }

    async getGrossRevenueTrend(_req: AuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const data = await this.adminDashboardService.getGrossRevenueTrend();
        res.status(200).json({ success: true, data });
    }

    async getOrdersTodayCount(_req: AuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const data = await this.adminDashboardService.getOrdersTodayCount();
        res.status(200).json({ success: true, data });
    }

    async getNeedsAction(_req: AuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const data = await this.adminDashboardService.getNeedsAction();
        res.status(200).json({ success: true, data });
    }
}
