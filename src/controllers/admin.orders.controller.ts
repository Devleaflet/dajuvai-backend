import { Response, NextFunction } from "express";
import { AdminOrdersService } from "../service/admin.orders.service";
import { AuthRequest } from "../middlewares/auth.middleware";

export class AdminOrdersController {
    private adminOrdersService: AdminOrdersService;

    constructor() {
        this.adminOrdersService = new AdminOrdersService();
    }

    async getOrderPageStats(_req: AuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const data = await this.adminOrdersService.getOrderPageStats();
        res.status(200).json({ success: true, data });
    }
}
