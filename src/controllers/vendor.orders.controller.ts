import { Response, NextFunction } from "express";
import { VendorAuthRequest } from "../middlewares/auth.middleware";
import { VendorOrdersService } from "../service/vendor.orders.service";

export class VendorOrdersController {
    private vendorOrdersService: VendorOrdersService;

    constructor() {
        this.vendorOrdersService = new VendorOrdersService();
    }

    async getOrderPageStats(req: VendorAuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const data = await this.vendorOrdersService.getOrderPageStats(req.vendor.id);
        res.status(200).json({ success: true, data });
    }
}
