import { Request, Response, NextFunction } from 'express';
import { HomePageSectionService } from '../service/homePageSection.service';
import { APIError } from '../utils/ApiError.utils';
import { ReviewService } from '../service/review.service';

/**
 * @class HomePageSectionController
 * @description Manages homepage section operations: create, update, retrieve, delete, and status toggling.
 */
export class HomePageSectionController {
    private homePageSectionService: HomePageSectionService;
    private reviewService: ReviewService

    /**
     * @constructor
     * @description Instantiates HomePageSectionService for business logic.
     */
    constructor() {
        this.homePageSectionService = new HomePageSectionService();
        this.reviewService = new ReviewService();
    }

    /**
     * @method createHomePageSection
     * @route POST /api/homepage-sections
     * @description Creates a new homepage section with title, active status, and product IDs.
     * @param {Request} req - Express request with title, isActive, and productIds in body.
     * @param {Response} res - Express response object.
     * @param {NextFunction} next - Express next middleware function.
     * @returns {Promise<void>} Responds with created section data.
     * @access Admin and staff 
     */
    createHomePageSection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // Extract and validate request body
            const { title, isActive = true, productIds } = req.body;

            if (!title || !productIds || !Array.isArray(productIds) || productIds.length === 0) {
                throw new APIError(400, 'Title and productIds array are required');
            }

            // Check for duplicate section title
            if (await this.homePageSectionService.checkByTitle(title)) {
                throw new APIError(409, `home page section with the name ${title} already exists`);
            }

            // Create section via service
            const section = await this.homePageSectionService.createHomePageSection({
                title,
                isActive,
                productIds
            });

            // Send success response
            res.status(201).json({
                success: true,
                message: 'Home page section created successfully',
                data: section
            });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Create homepage section error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    };

    /**
     * @method updateHomePageSection
     * @route PUT /api/homepage-sections/:id
     * @description Updates an existing homepage section by ID.
     * @param {Request} req - Express request with section ID in params and optional title, isActive, productIds in body.
     * @param {Response} res - Express response object.
     * @param {NextFunction} next - Express next middleware function.
     * @returns {Promise<void>} Responds with updated section data.
     * @access Admin and staff
     */
    updateHomePageSection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // Extract and validate section ID
            const { id } = req.params;
            if (!id || isNaN(Number(id))) {
                throw new APIError(400, 'Valid section ID is required');
            }

            // Extract request body
            const { title, isActive, productIds } = req.body;

            // Update section via service
            const section = await this.homePageSectionService.updateHomePageSection({
                sectionId: Number(id),
                title,
                isActive,
                productIds
            });

            // Send success response
            res.status(200).json({
                success: true,
                message: 'Home page section updated successfully',
                data: section
            });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Update homepage section error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    };

    /**
     * @method getAllHomePageSections
     * @route GET /api/homepage-sections
     * @description Retrieves all homepage sections, optionally including inactive ones.
     * @param {Request<{}, {}, {}, { includeInactive?: string }>} req - Express request with optional includeInactive query param.
     * @param {Response} res - Express response object.
     * @param {NextFunction} next - Express next middleware function.
     * @returns {Promise<void>} Responds with list of sections and count.
     * @access Public
     */
    getAllHomePageSections = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // Parse and convert includeInactive query parameter
            const includeInactiveRaw = req.query.includeInactive;
            const includeInactiveBool = includeInactiveRaw?.toString().toLowerCase() === 'true';

            // Fetch sections via service
            const sections = await this.homePageSectionService.getAllHomePageSections(includeInactiveBool);


            // Send success response
            res.status(200).json({
                success: true,
                message: 'Home page sections retrieved successfully',
                data: sections,
            });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Get all homepage sections error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    };

    /**
      * @method getHomePageSectionById
      * @route GET /api/homepage-sections/:id
      * @description Retrieves a specific homepage section by its ID.
      * @param {Request<{ id: string }>} req - Express request with section ID.
      * @param {Response} res - Express response object.
      * @param {NextFunction} next - Express next middleware function.
      * @returns {Promise<void>} Responds with section data.
      * @access Public
      */
    getHomePageSectionById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // Extract and validate section ID
            const { id } = req.params;
            if (!id || isNaN(Number(id))) {
                throw new APIError(400, 'Valid section ID is required');
            }

            // Fetch section via service
            const section = await this.homePageSectionService.getHomePageSectionById(Number(id));

            // const productsWithRatings = await Promise.all(
            //     section.products.map(async (product) => {
            //         const avgRating = await this.reviewService.getAverageRating(product.id);
            //         return { ...product, avgRating: avgRating.avgRating, count: avgRating.count };
            //     })
            // );

            // Send success response
            res.status(200).json({
                success: true,
                message: 'Home page section retrieved successfully',
                data: section
            });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Get homepage section by ID error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    };

    /**
     * @method deleteHomePageSection
     * @route DELETE /api/homepage-sections/:id
     * @description Deletes a homepage section by its ID.
     * @param {Request<{ id: string }>} req - Express request with section ID.
     * @param {Response} res - Express response object.
     * @param {NextFunction} next - Express next middleware function.
     * @returns {Promise<void>} Responds with success message.
     * @access Admin
     */
    deleteHomePageSection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // Extract and validate section ID
            const { id } = req.params;
            if (!id || isNaN(Number(id))) {
                throw new APIError(400, 'Valid section ID is required');
            }

            // Delete section via service
            const result = await this.homePageSectionService.deleteHomePageSection(Number(id));

            // Send success response
            res.status(200).json({
                success: true,
                message: result.message
            });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Delete homepage section error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    };

    /**
     * @method toggleSectionStatus
     * @route PATCH /api/homepage-sections/:id/status
     * @description Toggles the active status of a homepage section by its ID.
     * @param {Request<{ id: string }>} req - Express request with section ID.
     * @param {Response} res - Express response object.
     * @param {NextFunction} next - Express next middleware function.
     * @returns {Promise<void>} Responds with updated section data.
     * @access Admin and staff
     */
    toggleSectionStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        try {
            // Extract and validate section ID
            const { id } = req.params;
            if (!id || isNaN(Number(id))) {
                throw new APIError(400, 'Valid section ID is required');
            }

            // Toggle section status via service
            const section = await this.homePageSectionService.toggleSectionStatus(Number(id));

            // Send success response
            res.status(200).json({
                success: true,
                message: 'Section status toggled successfully',
                data: section
            });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Toggle section status error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    };
}