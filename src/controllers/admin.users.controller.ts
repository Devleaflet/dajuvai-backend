import { Response, NextFunction } from "express";
import { AdminUsersService } from "../service/admin.users.service";
import { AuthRequest } from "../middlewares/auth.middleware";

export class AdminUsersController {
    private adminUsersService: AdminUsersService;

    constructor() {
        this.adminUsersService = new AdminUsersService();
    }

    async getUserPageStats(_req: AuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const data = await this.adminUsersService.getUserPageStats();
        res.status(200).json({ success: true, data });
    }

    async getCustomerHeat(req: AuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const limit = parseInt((req.query as { limit?: string }).limit) || 20;
        const data = await this.adminUsersService.getCustomerHeatData(limit);
        res.status(200).json({ success: true, data });
    }
}
