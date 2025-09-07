import { Request, Response } from 'express';
import { CreateBannerInput, UpdateBannerInput } from '../utils/zod_validations/banner.zod';
import { APIError } from '../utils/ApiError.utils';
import { AuthRequest } from '../middlewares/auth.middleware';
import { BannerService } from '../service/banner.service';
import { ProductSource } from '../entities/banner.entity';
import { ProductService } from '../service/product.service';
import { CategoryService } from '../service/category.service';
import { SubcategoryService } from '../service/subcategory.service';
import { DealService } from '../service/deal.service';
import { Deal } from '../entities/deal.entity';
import AppDataSource from '../config/db.config';

/**
 * @class BannerController
 * @description Controller responsible for handling banner management endpoints.
 * Supports create, update, fetch, delete, and search operations.
 */
export class BannerController {
    private bannerService: BannerService;
    private productService: ProductService;
    private categoryService: CategoryService;
    private subcategoryService: SubcategoryService;
    private dealService: DealService;

    /**
     * @constructor
     * @description Initializes the BannerController and instantiates the BannerService.
     */
    constructor() {
        this.bannerService = new BannerService();
        this.categoryService = new CategoryService();
        this.productService = new ProductService(AppDataSource);
        this.subcategoryService = new SubcategoryService();
        this.dealService = new DealService()
    }

    /**
     * @method createBanner
     * @description Creates new banner with the authenticated admin and uploaded images.
     * Handles different banner types and product sources according to requirements.
     * @route POST /api/banners
     * @param {AuthRequest<{}, {}, CreateBannerInput>} req - Authenticated request with banner data and files
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with created banner data
     * @throws {APIError} 401 if user is not authenticated
     * @throws {APIError} 400 if validation fails
     * @throws {APIError} 500 on internal server error 
     * @access Admin and staff 
     * */
    async createBanner(req: AuthRequest<{}, {}, CreateBannerInput>, res: Response): Promise<void> {
        try {
            console.log("📩 Incoming createBanner request:", { body: req.body });

            const bannerData = req.body;
            const {
                name,
                desktopImage,
                mobileImage,
                type,
                startDate,
                endDate,
                productSource,
                selectedProducts,
                selectedCategoryId,
                selectedSubcategoryId,
                selectedDealId,
                externalLink,
            } = bannerData;

            const productSourceType = productSource as ProductSource;
            console.log("🔍 Parsed productSourceType:", productSourceType);

            // check if banner already exists
            const bannernameExists = await this.bannerService.getBannerByName(bannerData.name);
            console.log("📝 Banner name exists check:", bannernameExists);

            if (bannernameExists) {
                throw new APIError(409, "Banner with this name already exists");
            }

            switch (productSourceType) {
                case ProductSource.MANUAL:
                    console.log("⚙️ Handling manual product source...");
                    if (!selectedProducts || selectedProducts.length === 0) {
                        throw new APIError(400, "At least one product must be selected for manual product source");
                    }

                    const productIds = await Promise.all(
                        selectedProducts.map(async (productId) => {
                            console.log(productId)
                            const productExists = await this.productService.getProductDetailsById(productId);
                            console.log(`🔎 Checking product ID ${productId}:`, !!productExists);
                            if (!productExists) {
                                throw new APIError(400, `Product with ID ${productId} does not exist`);
                            }
                            return productId;
                        })
                    );

                    console.log("✅ Valid product IDs:", productIds);
                    const bannerManual = await this.bannerService.createBanner(
                        { ...bannerData, selectedProducts: productIds },
                        req.user.id
                    );
                    console.log("🎉 Banner created (manual):", bannerManual);

                    res.status(201).json({ success: true, data: bannerManual });
                    break;

                case ProductSource.CATEGORY:
                    console.log("⚙️ Handling category product source...");
                    if (!selectedCategoryId) {
                        throw new APIError(400, "Selected category is required");
                    }
                    const categoryExists = await this.categoryService.getCategoryById(selectedCategoryId);
                    console.log("🔎 Checking category ID:", selectedCategoryId, "exists:", !!categoryExists);

                    if (!categoryExists) {
                        throw new APIError(400, `Category with ID ${selectedCategoryId} does not exist`);
                    }

                    const bannerCategory = await this.bannerService.createBanner(
                        { ...bannerData, selectedCategoryId },
                        req.user.id
                    );
                    console.log("🎉 Banner created (category):", bannerCategory);

                    res.status(201).json({ success: true, message: "Banner created with category" });
                    break;

                case ProductSource.SUBCATEGORY:
                    console.log("⚙️ Handling subcategory product source...");
                    const bannerSubcat = await this.bannerService.createBanner(
                        { ...bannerData, selectedCategoryId, selectedSubcategoryId },
                        req.user.id
                    );
                    console.log("🎉 Banner created (subcategory):", bannerSubcat);

                    res.status(201).json({ success: true, message: "Banner created with subcategory" });
                    break;

                case ProductSource.DEAL:
                    console.log("⚙️ Handling deal product source...");
                    const dealExists = await this.dealService.getDealById(selectedDealId);
                    console.log("🔎 Checking deal ID:", selectedDealId, "exists:", !!dealExists);

                    if (!dealExists) {
                        throw new APIError(400, `Deal with ID ${selectedDealId} does not exist`);
                    }

                    const bannerDeal = await this.bannerService.createBanner(
                        { ...bannerData, selectedDealId },
                        req.user.id as number
                    );
                    console.log("🎉 Banner created (deal):", bannerDeal);

                    res.status(201).json({ success: true, message: "Banner created with deal" });
                    break;

                case ProductSource.EXTERNAL:
                    console.log("⚙️ Handling external product source...");
                    if (!externalLink) {
                        throw new APIError(400, "External link is required");
                    }
                    const bannerExternal = await this.bannerService.createBanner(
                        { ...bannerData, externalLink },
                        req.user.id
                    );
                    console.log("🎉 Banner created (external):", bannerExternal);

                    res.status(201).json({ success: true, message: "Banner created with external link" });
                    break;

                default:
                    console.warn("⚠️ Invalid product source type received:", productSourceType);
                    throw new APIError(400, "Invalid product source type");
            }
        } catch (error) {
            console.error("❌ Create banner error:", error);
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: "Internal server error" });
            }
        }
    }



    /**
     * @method updateBanner
     * @description Updates an existing banner with the authenticated admin and uploaded images.
     * Handles different banner types and product sources according to requirements.
     * @route PUT /api/banners/:id
     * @param {AuthRequest<{ id: number }, {}, UpdateBannerInput>} req - Authenticated request with banner ID and updated data
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with updated banner data
     * @throws {APIError} 401 if user is not authenticated
     * @throws {APIError} 400 if validation fails
     * @throws {APIError} 404 if banner not found
     * @throws {APIError} 500 on internal server error
     * @access Admin and Staff 
     */
    async updateBanner(
        req: AuthRequest<{ id: number }, {}, UpdateBannerInput>,
        res: Response
    ): Promise<void> {
        try {
            console.log('Update banner request:', { params: req.params, body: req.body, user: req.user });

            if (!req.user) {
                throw new APIError(401, 'Unauthorized: No user found');
            }

            const { id } = req.params;
            const bannerData = req.body;

            console.log('[updateBanner] id:', id);
            console.log('[updateBanner] bannerData:', bannerData);
            console.log('[updateBanner] userId:', req.user.id);

            // check if banner exists
            const existingBanner = await this.bannerService.getBannerById(Number(id));
            console.log('[updateBanner] existingBanner:', existingBanner);
            if (!existingBanner) {
                throw new APIError(404, 'Banner not found');
            }

            // validate productSource 
            if (bannerData.productSource) {
                console.log('[updateBanner] productSource provided:', bannerData.productSource);
                switch (bannerData.productSource) {
                    case ProductSource.MANUAL:
                        console.log('[updateBanner] MANUAL -> selectedProducts:', bannerData.selectedProducts);
                        if (!bannerData.selectedProducts?.length) {
                            throw new APIError(400, 'At least one product is required for manual product source');
                        }
                        break;

                    case ProductSource.CATEGORY:
                        console.log('[updateBanner] CATEGORY -> selectedCategoryId:', bannerData.selectedCategoryId);
                        if (!bannerData.selectedCategoryId) {
                            throw new APIError(400, 'Category ID required for category product source');
                        }
                        break;

                    case ProductSource.SUBCATEGORY:
                        console.log('[updateBanner] SUBCATEGORY -> selectedSubcategoryId:', bannerData.selectedSubcategoryId);
                        if (!bannerData.selectedSubcategoryId) {
                            throw new APIError(400, 'Subcategory ID required for subcategory product source');
                        }
                        break;

                    case ProductSource.DEAL:
                        console.log('[updateBanner] DEAL -> selectedDealId:', bannerData.selectedDealId);
                        if (!bannerData.selectedDealId) {
                            throw new APIError(400, 'Deal ID required for deal product source');
                        }
                        break;

                    case ProductSource.EXTERNAL:
                        console.log('[updateBanner] EXTERNAL -> externalLink:', bannerData.externalLink);
                        if (!bannerData.externalLink) {
                            throw new APIError(400, 'External link required for external product source');
                        }
                        break;

                    default:
                        console.log('[updateBanner] Invalid product source:', bannerData.productSource);
                        throw new APIError(400, 'Invalid product source type');
                }
            } else {
                console.log('[updateBanner] No productSource in request body; proceeding with base updates only.');
            }

            console.log('[updateBanner] calling bannerService.updateBanner...');
            const banner = await this.bannerService.updateBanner(
                Number(id),
                bannerData,
                req.user.id
            );

            console.log('[updateBanner] banner updated successfully:', banner);

            res.status(200).json({ success: true, data: banner });

        } catch (error) {
            if (error instanceof APIError) {
                console.error('[updateBanner][APIError] ', { status: error.status, message: error.message, stack: error.stack });
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                console.error('Update banner error:', error);
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
            // If it's a custom API error
            if (error instanceof APIError) {
                console.error(`[APIError] ${error.status} - ${error.message}`, {
                    stack: error.stack,
                    timestamp: new Date().toISOString(),
                });
                res.status(error.status).json({
                    success: false,
                    message: error.message,
                });
            }

            // For other unexpected errors
            console.error(`[UnexpectedError]`, {
                message: error instanceof Error ? error.message : error,
                stack: error instanceof Error ? error.stack : undefined,
                timestamp: new Date().toISOString(),
            });

            const isDev = true;
            res.status(500).json({
                success: false,
                message: isDev
                    ? error instanceof Error
                        ? error.message
                        : 'Unknown error'
                    : 'Internal server error',
            });
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