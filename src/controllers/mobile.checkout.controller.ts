import { Response, NextFunction } from "express";
import { MobileCheckoutService } from "../service/mobile.checkout.service";
import { AuthRequest } from "../middlewares/auth.middleware";

export class MobileCheckoutController {
    private checkoutService: MobileCheckoutService;

    constructor() {
        this.checkoutService = new MobileCheckoutService();
    }

    async getCheckoutDetails(req: AuthRequest, res: Response): Promise<void> {
        const data = await this.checkoutService.getMobileCheckoutDetails(req.user?.id);
        res.status(200).json({ success: true, data });
    }
}
