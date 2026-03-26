import { Response } from 'express';
import { APIError } from '../utils/ApiError.utils';
import { AdminUsersService } from '../service/admin.users.service';
import { AuthRequest } from '../middlewares/auth.middleware';

/**
 * @class AdminUsersController
 * @description Handles admin user-related endpoints.
 */
export class AdminUsersController {
    private adminUsersService: AdminUsersService;

    constructor() {
        this.adminUsersService = new AdminUsersService();
    }

    /**
     * @method getUserPageStats
     * @description Returns aggregated user page statistics (total users, new users this week, average order value).
     * @route GET /api/admin/users/stats
     */
    async getUserPageStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            const data = await this.adminUsersService.getUserPageStats();
            res.status(200).json({ success: true, data });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error fetching user page stats',
                });
            }
        }
    }

    /**
     * @method getCustomerHeat
     * @description Returns customer heat data showing order frequency and spend.
     * @route GET /api/admin/users/heat
     */
    async getCustomerHeat(req: AuthRequest, res: Response): Promise<void> {
        try {
            const limit = parseInt((req.query as { limit?: string }).limit) || 20;
            const data = await this.adminUsersService.getCustomerHeatData(limit);
            res.status(200).json({ success: true, data });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error fetching customer heat data',
                });
            }
        }
    }
}
