import { Response } from 'express';
import { MobileCheckoutService } from '../service/mobile.checkout.service';
import { APIError } from '../utils/ApiError.utils';
import { AuthRequest } from '../middlewares/auth.middleware';

export class MobileCheckoutController {
    private checkoutService: MobileCheckoutService;

    constructor() {
        this.checkoutService = new MobileCheckoutService();
    }

    async getCheckoutDetails(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) throw new APIError(401, 'Unauthorized');

            const data = await this.checkoutService.getMobileCheckoutDetails(userId);

            res.status(200).json({ success: true, data });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }
}
