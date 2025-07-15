import { Request, Response } from "express";
import { z } from "zod";
import { APIError } from "../utils/ApiError.utils";
import { DistrictService } from "../service/district.service";
import { CreateDistrictInput, createDistrictSchema, getDistrictByIdSchema, UpdateDistrictInput, updateDistrictSchema } from "../utils/zod_validations/district.zod";
import { AuthRequest } from "../middlewares/auth.middleware";



/**
 * @controller DistrictController
 * @description Handles all operations related to districts such as create, update, retrieve, and delete.
 */

export class DistrictController {
    private districtService: DistrictService;

    /**
     * @constructor
     * @description Initializes a new instance of DistrictController with DistrictService
     */
    constructor() {
        this.districtService = new DistrictService();
    }

    /**
   * @method createDistrict
   * @route POST /api/districts
   * @description Creates a new district for the authenticated admin user.
   * @param {AuthRequest<{}, {}, CreateDistrictInput>} req - Authenticated request containing district data.
   * @param {Response} res - Express response object.
   * @returns {Promise<void>} Responds with the created district data.
   * @access Admin
   */
    async createDistrict(req: AuthRequest<{}, {}, CreateDistrictInput>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema
            const parsed = createDistrictSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Validate authenticated user
            const user = req.user;
            if (!user) {
                res.status(401).json({ success: false, message: "Unauthorized" });
                return;
            }

            // Create district via service
            const district = await this.districtService.createDistrict(parsed.data.name);
            // Send success response
            res.status(201).json({ success: true, data: district });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Create district error:', error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        }
    }

    /**
   * @method updateDistrict
   * @route PUT /api/districts/:id
   * @description Updates an existing district by ID for the authenticated admin user.
   * @param {AuthRequest<{ id: string }, {}, UpdateDistrictInput>} req - Authenticated request containing district ID and update data.
   * @param {Response} res - Express response object.
   * @returns {Promise<void>} Responds with the updated district data.
   * @access Admin
   */
    async updateDistrict(req: AuthRequest<{ id: string }, {}, UpdateDistrictInput>, res: Response): Promise<void> {
        try {
            // Validate ID parameter using Zod schema
            const idParsed = getDistrictByIdSchema.safeParse(req.params);
            if (!idParsed.success) {
                res.status(400).json({ success: false, errors: idParsed.error.errors });
                return;
            }

            // Validate request body using Zod schema
            const parsed = updateDistrictSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Validate authenticated user
            const user = req.user;
            if (!user) {
                res.status(401).json({ success: false, message: "Unauthorized" });
                return;
            }

            // Update district via service
            const district = await this.districtService.updateDistrict(idParsed.data.id, parsed.data.name);
            // Send success response
            res.status(200).json({ success: true, data: district });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Update district error:', error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        }
    }

    /**
   * @method getDistricts
   * @route GET /api/districts
   * @description Retrieves all districts in the system.
   * @param {Request} req - Express request object.
   * @param {Response} res - Express response object.
   * @returns {Promise<void>} Responds with a list of all districts.
   * @access Public
   */
    async getDistricts(req: Request, res: Response): Promise<void> {
        try {
            // Fetch all districts via service
            const districts = await this.districtService.getDistricts();
            // Send success response
            res.status(200).json({ success: true, data: districts });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Get districts error:', error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        }
    }

    /**
   * @method getDistrictById
   * @route GET /api/districts/:id
   * @description Retrieves a specific district by its ID.
   * @param {Request<{ id: string }>} req - Request containing district ID in route parameters.
   * @param {Response} res - Express response object.
   * @returns {Promise<void>} Responds with the district data.
   * @access Public
   */
    async getDistrictById(req: Request<{ id: string }>, res: Response): Promise<void> {
        try {
            // Validate ID parameter using Zod schema
            const parsed = getDistrictByIdSchema.safeParse(req.params);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Fetch district via service
            const district = await this.districtService.findDistrictById(parsed.data.id);
            // Send success response
            res.status(200).json({ success: true, data: district });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Get district by ID error:', error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        }
    }

    /**
   * @method deleteDistrict
   * @route DELETE /api/districts/:id
   * @description Deletes a specific district by its ID for the authenticated admin and staff user.
   * @param {AuthRequest<{ id: string }, {}, {}>} req - Authenticated request containing district ID.
   * @param {Response} res - Express response object.
   * @returns {Promise<void>} Responds with a success message upon deletion.
   * @access Admin and staff
   */
    async deleteDistrict(req: AuthRequest<{ id: string }, {}, {}>, res: Response): Promise<void> {
        try {
            // Validate ID param with Zod
            const parsed = getDistrictByIdSchema.safeParse(req.params);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }
            const districtId = parsed.data.id;

            // Validate authenticated user
            const user = req.user;
            if (!user) {
                res.status(401).json({ success: false, message: "Unauthorized" });
                return;
            }

            // Delete district via service
            await this.districtService.deleteDistrict(districtId);
            // Send success response
            res.status(200).json({ success: true, message: "District deleted successfully" });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Delete district error:', error);
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        }
    }
}