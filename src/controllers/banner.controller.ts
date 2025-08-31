import { Request, Response } from 'express';
import { CreateBannerInput, UpdateBannerInput } from '../utils/zod_validations/banner.zod';
import { APIError } from '../utils/ApiError.utils';
import { AuthRequest } from '../middlewares/auth.middleware';
import { BannerService } from '../service/banner.service';

/**
 * @class BannerController
 * @description Controller responsible for handling banner management endpoints.
 * Supports create, update, fetch, delete, and search operations.
 */
export class BannerController {
    private bannerService: BannerService;

    /**
     * @constructor
     * @description Initializes the BannerController and instantiates the BannerService.
     */
    constructor() {
        this.bannerService = new BannerService();
    }

    /**
     * @method createBanner
     * @description Creates new banner with the authenticated admin and uplaoded image.
     * @route POST /api/banners
     * @param {AuthRequest<{}, {}, CreateBannerInput>} req - Authenticated request with banner data and file
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with created banner data
     * @throws {APIError} 401 if user is not authenticated
     * @throws {APIError} 500 on internal server error 
     * @access Admin and staff 
     * */
    async createBanner(req: AuthRequest<{}, {}, CreateBannerInput>, res: Response): Promise<void> {
    try {
        console.log('Create banner request:', { body: req.body, files: req.files, user: req.user });

        if (!req.user) {
            throw new APIError(401, 'Unauthorized: No user found');
        }

        const files = req.files as { [fieldname: string]: Express.Multer.File[] };

        const desktopFile = files?.desktopImage?.[0];
        const mobileFile = files?.mobileImage?.[0];

        const banner = await this.bannerService.createBanner(req.body, desktopFile, mobileFile, req.user.id);

        res.status(201).json({ success: true, data: banner });
    } catch (error) {
        if (error instanceof APIError) {
            res.status(error.status).json({ success: false, message: error.message });
        } else {
            console.error('Create banner error:', error);
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
}


    /**
     * @method updateBanner
     * @description Updates an existing banner by ID, optionally with a new image.
     * @route PUT /admin/banners/:id
     * @param {AuthRequest<{ id: number }, {}, UpdateBannerInput>} req - Authenticated request with banner ID and update data
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with updated banner data
     * @throws {APIError} 500 on internal server error
     * @access Admin and Staff 
     */
    async updateBanner(req: AuthRequest<{ id: number }, {}, UpdateBannerInput>, res: Response): Promise<void> {
    try {
        const { id } = req.params;
        const files = req.files as { [fieldname: string]: Express.Multer.File[] };

        const desktopFile = files?.desktopImage?.[0];
        const mobileFile = files?.mobileImage?.[0];

        const banner = await this.bannerService.updateBanner(
            Number(id),
            req.body,
            desktopFile,
            mobileFile,
            req.user!.id
        );

        res.status(200).json({ success: true, data: banner });
    } catch (error) {
        if (error instanceof APIError) {
            res.status(error.status).json({ success: false, message: error.message });
        } else {
            res.status(500).json({ success: false, message: 'Internal server error' });
        }
    }
}


    /**
     * @method getBannerById
     * @description Retrieves a banner by its unique ID.
     * @route GET /api/banners/:id
     * @param {Request<{ id: string }>} req - Request with banner ID
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with banner data
     * @throws {APIError} 500 on internal server error
     * @access Public
     */
    async getBannerById(req: Request<{ id: string }>, res: Response): Promise<void> {
        try {
            // Extract banner ID from params
            const { id } = req.params;

            // Fetch banner via service
            const banner = await this.bannerService.getBannerById(Number(id));

            // Send success response
            res.status(200).json({ success: true, data: banner });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @method getAllBanners
     * @description Fetches all available banners.
     * @route GET /api/banners
     * @param {Request} req - Standard Express request
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with list of banners
     * @throws {APIError} 500 on internal server error
     * @access Public
     */
    async getAllBanners(req: Request, res: Response): Promise<void> {
        try {
            // Fetch all banners via service
            const banners = await this.bannerService.getAllBanners();

            // Send success response
            res.status(200).json({ success: true, data: banners });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @method deleteBanner
     * @description Deletes a banner by its ID.
     * @route DELETE /admin/banners/:id
     * @param {Request<{ id: number }>} req - Request with banner ID to delete
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with success message
     * @throws {APIError} 404 if banner not found
     * @throws {APIError} 500 on internal server error
     * @access Admin
     */
    async deleteBanner(req: Request<{ id: number }>, res: Response): Promise<void> {
        try {
            // Extract banner ID from params
            const { id } = req.params;

            // Verify banner exists
            const banner = await this.bannerService.getBannerById(Number(id));
            if (!banner) {
                throw new APIError(404, `Banner with id: ${id} does not exist`);
            }

            // Delete banner via service
            const deletedBanner = await this.bannerService.deleteBanner(id);
            // Log deletion for auditing
            console.log(`Deleted banner: ${deletedBanner}`);

            // Send success response
            res.status(200).json({
                success: true,
                message: `Banner with id: ${id} deleted successfully`,
            });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @method searchBannerByBannerName
     * @description Searches for banners by name.
     * @route GET /banners/search/:bannerName
     * @param {Request<{ bannerName: string }>} req - Request with banner name
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with matching banner(s)
     * @throws {APIError} 400 if banner name is empty
     * @throws {APIError} 404 if banner is not found
     * @throws {APIError} 500 on internal server error
     * @access Public
     */
    async searchBannerByBannerName(req: Request<{ bannerName: string }>, res: Response): Promise<void> {
        try {
            // Extract banner name from params
            const { bannerName } = req.params;

            // Validate banner name
            if (!bannerName) {
                throw new APIError(400, 'Banner name must not be empty');
            }

            // Search banners via service
            const banner = await this.bannerService.searchBannersByName(bannerName);
            if (!banner) {
                throw new APIError(404, 'Banner does not exist');
            }

            // Send success response
            res.status(200).json({
                success: true,
                data: banner,
            });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }
}