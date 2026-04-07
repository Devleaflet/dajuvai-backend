import { Response, NextFunction } from "express";
import { AdminVendorsService } from "../service/admin.vendors.service";
import { AuthRequest } from "../middlewares/auth.middleware";

export class AdminVendorsController {
    private adminVendorsService: AdminVendorsService;

    constructor() {
        this.adminVendorsService = new AdminVendorsService();
    }

    async getVendorPageStats(_req: AuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const data = await this.adminVendorsService.getVendorPageStats();
        res.status(200).json({ success: true, data });
    }

    async getTopEarningVendor(_req: AuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const data = await this.adminVendorsService.getTopEarningVendorThisMonth();
        res.status(200).json({ success: true, data });
    }
}
