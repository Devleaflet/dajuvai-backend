import { Request, Response } from 'express';
import { CreateDealInput, UpdateDealInput } from '../utils/zod_validations/deal.zod';
import { APIError } from '../utils/ApiError.utils';
import { AuthRequest } from '../middlewares/auth.middleware';
import { DealStatus } from '../entities/deal.entity';
import { DealService } from '../service/deal.service';

/**
 * @controller DealController
 * @description Handles all endpoints related to deals including creation, update, retrieval, and deletion.
 */
export class DealController {
    private dealService: DealService;

    /**
     * @constructor
     * @description Initializes a new instance of DealController with DealService.
     */
    constructor() {
        this.dealService = new DealService();
    }

    /**
     * @method createDeal
     * @route POST /api/deals
     * @description Creates a new deal for the authenticated admin or staff.
     * @param {AuthRequest<{}, {}, CreateDealInput>} req - Express request containing deal creation input and authenticated user.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with created deal data.
     * @access Admin and staff
     */
    async createDeal(req: AuthRequest<{}, {}, CreateDealInput>, res: Response): Promise<void> {
        try {
            // Create deal via service with authenticated user ID
            const deal = await this.dealService.createDeal(req.body, req.user!.id);
            // Send success response
            res.status(201).json({ success: true, data: deal });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Create deal error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @method updateDeal
     * @route PUT /api/deals/:id
     * @description Updates a deal by its ID for the authenticated admin or staff.
     * @param {AuthRequest<{ id: string }, {}, UpdateDealInput>} req - Request with deal ID in params and update data in body.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with updated deal data.
     * @access Admin and staff
     */
    async updateDeal(req: AuthRequest<{ id: string }, {}, UpdateDealInput>, res: Response): Promise<void> {
        try {
            // Extract deal ID from params
            const { id } = req.params;
            // Call service to update deal with new data
            const deal = await this.dealService.updateDeal(Number(id), req.body);
            // Send success response
            res.status(200).json({ success: true, data: deal });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Update deal error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @method getDealById
     * @route GET /api/deals/:id
     * @description Fetches a deal by its ID.
     * @param {Request<{ id: string }>} req - Request containing deal ID in route params.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with deal details.
     * @access Public
     */
    async getDealById(req: Request<{ id: string }>, res: Response): Promise<void> {
        try {
            // Extract deal ID from params
            const { id } = req.params;
            // Fetch deal details from service layer
            const deal = await this.dealService.getDealById(Number(id));
            // Send success response
            res.status(200).json({ success: true, data: deal });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Get deal by ID error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @method getAllDeals
     * @route GET /api/deals
     * @description Retrieves all deals, optionally filtered by deal status.
     * @param {Request<{}, {}, {}, { status?: string }>} req - Request with optional `status` query param.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with array of deals, total count, and product counts.
     * @access Public
     */
    async getAllDeals(req: Request<{}, {}, {}, { status?: string }>, res: Response): Promise<void> {
        try {
            // Extract status from query, if provided
            const status = req.query.status as DealStatus | undefined;
            // Fetch deals and associated product counts from service
            const { deals, total, productCounts } = await this.dealService.getAllDeals(status);
            // Send success response
            res.status(200).json({ success: true, data: { deals, total, productCounts } });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Get all deals error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

   /**
     * @method deleteDeal
     * @route DELETE /api/deals/:id
     * @description Deletes a deal by its ID for the authenticated admin or staff.
     * @param {AuthRequest<{ id: string }>} req - Authenticated request containing deal ID in route params.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with deletion success message and deleted deal.
     * @access Admin adn staff 
     */
    async deleteDeal(req: AuthRequest<{ id: string }>, res: Response): Promise<void> {
        try {
            // Extract deal ID from params
            const { id } = req.params;
            // Delete deal via service
            const deletedDeal = await this.dealService.deleteDeal(Number(id));
            // Send success response
            res.status(200).json({ success: true, msg: "Deal deleted sucessfully", deletedDeal });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Delete deal error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }
}