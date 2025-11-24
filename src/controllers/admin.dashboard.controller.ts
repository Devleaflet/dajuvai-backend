import { Request, Response } from 'express';
import { APIError } from '../utils/ApiError.utils';
import { AdminDashBoardService } from '../service/admin.dashboard.service';
import { AuthRequest } from '../middlewares/auth.middleware';
import { LoginInput } from '../utils/zod_validations/user.zod';
import { truncateSync } from 'fs';
import { InstanceChecker } from 'typeorm';

/**
 * @class AdminDashboardController
 * @description Controller class responsible for handling admin dashboard-related endpoints.
 * Provides APIs to fetch dashboard summary statistics and revenue chart data.
 */
export class AdminDashboardController {
    private adminDashboardService: AdminDashBoardService;

    /**
     * @constructor
     * @description Initializes the controller and sets up the service dependency.
     */
    constructor() {
        // Instantiate the service responsible for dashboard data logic
        this.adminDashboardService = new AdminDashBoardService();
    }

    /**
     * @method getDashboardStats
     * @description Retrieves high-level summary stats for the admin dashboard
     * (e.g., total users, orders, revenue).
     * @route GET /api/admin/dashboard/stats
     * @param {AuthRequest} req - Authenticated request (must be an admin)
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Sends JSON response with dashboard statistics
     * @throws {APIError} 500 on internal server error or custom message
     * @access Admin
     */
    async getDashboardStats(req: AuthRequest, res: Response): Promise<void> {
        try {
            // Fetch stats from the service layer
            const stats = await this.adminDashboardService.getDashboardStats();

            console.log(stats)

            // Send success response with data
            res.status(200).json({ success: true, data: stats });
        } catch (error) {
            // If the error is a known APIError, respond with its status and message
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Otherwise, respond with a generic 500 error
                res.status(500).json({
                    success: false,
                    message: 'Error fetching dashboard stats',
                    error: error.message
                });
            }
        }
    }

    /**
     * @method getRevenueChart
     * @description Retrieves revenue chart data for the past `n` days.
     * Useful for visualizing sales trends on the admin dashboard.
     * @route GET /api/admin/dashboard/revenue?days={n}
     * @param {AuthRequest<{}, {}, {}, { days: string }>} req - Authenticated request with query param `days`
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Sends JSON response with revenue chart data
     * @access Admin
     */
    async getRevenueChart(req: AuthRequest<{}, {}, {}, { days: string }>, res: Response): Promise<void> {
        // Parse 'days' from query string, defaulting to 7 if not provided or invalid
        const days = parseInt(req.query.days as string) || 7;

        // Call service method to fetch chart data for given range
        const chartData = await this.adminDashboardService.getRevenueChart(days);

        // Send chart data in response
        res.status(200).json(chartData);
    }

    async getVendorsSalesAmount(req: AuthRequest, res: Response) {
        let { startDate, endDate, page } = req.query as { startDate?: string, endDate?: string, page?: number };
        if (!page || page < 1) page = 1;
        try {
            const data = await this.adminDashboardService.getVendorsSalesAmount(startDate, endDate, page);
            res.status(200).json({ success: true, data });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Otherwise, respond with a generic 500 error
                res.status(500).json({
                    success: false,
                    message: 'Error fetching vendors sales amount',
                    error: error.message
                });
            }

        }
    }

    async getTopProducts(req: AuthRequest, res: Response) {
        try {
            let { startDate, endDate, page } = req.query as { startDate?: string, endDate?: string, page?: number };

            if (!page || page < 1) page = 1;
            const data = await this.adminDashboardService.getTopProducts(startDate, endDate, page);
            res.status(200).json({ success: true, data });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Otherwise, respond with a generic 500 error
                res.status(500).json({
                    success: false,
                    message: 'Error fetching top products',
                    error: error.message
                });
            }

        }
    }

    async getTodaysSales(req: AuthRequest, res: Response) {
        try {
            const data = await this.adminDashboardService.getTodayTotalSales();
            res.status(200).json({ success: true, data });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Otherwise, respond with a generic 500 error
                res.status(500).json({
                    success: false,
                    message: 'Error fetching today\'s sales',
                    error: error.message
                });
            }
        }
    }

    // product , order, orderitem , variants, category , subcateg

    async getRevenueByCategory(req: AuthRequest<{}, {}, {}, { startDate: string, endDate: string }>, res: Response) {
        try {
            const { startDate, endDate } = req.query;
            const data = await this.adminDashboardService.getRevenueByCategory(startDate, endDate);
            res.status(200).json({ success: true, data });

        } catch (error) {
            console.log(error)
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error fetching data',
                    error: error.message
                });
            }
        }
    }

    async getRevenueBySubCategory(req: AuthRequest<{}, {}, {}, { startDate: string, endDate: string }>, res: Response) {
        try {
            const { startDate, endDate } = req.query;
            const data = await this.adminDashboardService.getRevenueBySubcategory(startDate, endDate);
            res.status(200).json({ success: true, data });

        } catch (error) {
            console.log(error)
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error fetching data',
                    error: error.message
                });
            }
        }
    }



    async getRevenueByVendor(req: AuthRequest, res: Response) {
        try {
            const data = await this.adminDashboardService.getRevenueByVendor();
            res.status(200).json({
                success: true,
                data
            })
        } catch (error) {
            console.log(error)
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error fetching data',
                    error: error.message
                });
            }
        }
    }
    async getTotalShippingRevenue(req: AuthRequest<{}, {}, {}, { startDate: string, endDate: string }>, res: Response) {
        try {
            const { startDate, endDate } = req.query;
            const data = await this.adminDashboardService.getTotalShippingRevenue(startDate, endDate);
            res.status(200).json({ data });

        } catch (error) {
            console.log(error)
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error fetching data',
                    error: error.message
                });
            }
        }
    }

}
