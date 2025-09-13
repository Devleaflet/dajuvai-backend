import { Request, Response, NextFunction } from 'express';
import { HomePageSectionService } from '../service/homePageSection.service';
import { APIError } from '../utils/ApiError.utils';
import { ReviewService } from '../service/review.service';
import { ProductController } from './product.controller';
import { DataSource, TreeRepositoryNotSupportedError } from 'typeorm';
import AppDataSource from '../config/db.config';
import { ICreateHomepageSectionInput } from '../interface/homepage.interface';
import { ProductSource } from '../entities/banner.entity';
import { ProductService } from '../service/product.service';
import { CategoryService } from '../service/category.service';
import { SubcategoryService } from '../service/subcategory.service';
import { DealService } from '../service/deal.service';

/**
 * @class HomePageSectionController
 * @description Manages homepage section operations: create, update, retrieve, delete, and status toggling.
 */
export class HomePageSectionController {
    private homePageSectionService: HomePageSectionService;
    private reviewService: ReviewService
    private productController: ProductController;
    private productService: ProductService;
    private categoryService: CategoryService;
    private subcategoryService: SubcategoryService;
    private dealService: DealService;

    /**
     * @constructor
     * @description Instantiates HomePageSectionService for business logic.
     */
    constructor() {
        this.homePageSectionService = new HomePageSectionService();
        this.reviewService = new ReviewService();
        this.productController = new ProductController(AppDataSource)
        this.productService = new ProductService(AppDataSource)
        this.categoryService = new CategoryService()
        this.subcategoryService = new SubcategoryService();
        this.dealService = new DealService();
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
    createHomePageSection = async (req: Request<{}, {}, ICreateHomepageSectionInput, {}>, res: Response, next: NextFunction): Promise<void> => {
        try {

            console.log("📩 Incoming create home page request:", { body: req.body });

            const data: ICreateHomepageSectionInput = req.body;

            const existingSection = await this.homePageSectionService.checkByTitle(data.title);

            if (existingSection) {
                throw new APIError(404, "Section with this title already exists")
            }

            switch (data.productSource) {
                case ProductSource.MANUAL:
                    for (const id of data.productIds) {
                        const productExists = await this.productService.getProductDetailsById(id)

                        if (!productExists) {
                            throw new APIError(404, "Product does nto exists")
                        }
                    }

                    console.log("create home catalog")
                    const homepageManual = await this.homePageSectionService.createHomePageSection(data)

                    res.status(201).json({
                        success: true,
                        homepage: homepageManual
                    })

                    break;

                case ProductSource.CATEGORY:
                    const categoryExists = await this.categoryService.getCategoryById(data.selectedCategoryId);

                    if (!categoryExists) {
                        throw new APIError(404, "Selected category doesnot exists")
                    }

                    const homepagecategory = await this.homePageSectionService.createHomePageSection(data)

                    res.status(201).json({
                        success: true,
                        homepage: homepagecategory
                    })

                    break;

                case ProductSource.SUBCATEGORY:
                    const subcategoryExists = await this.subcategoryService.handleGetSubcategoryById(data.selectedSubcategoryId)

                    if (!subcategoryExists) {
                        throw new APIError(404, "Selected sucategory does not exists")
                    }

                    const homepagesubcategory = await this.homePageSectionService.createHomePageSection(data);

                    res.status(201).json({
                        success: true,
                        homepage: homepagesubcategory
                    })

                    break;

                case ProductSource.DEAL:
                    const dealExists = await this.dealService.handleGetDealById(data.selectedDealId);

                    if (!dealExists) {
                        throw new APIError(404, "selected deal doesnot exists")
                    }

                    const homepagedeal = await this.homePageSectionService.createHomePageSection(data);

                    res.status(201).json({
                        success: true,
                        homepage: homepagedeal
                    })

                    break;

                default:
                    console.warn("⚠️ Invalid product source type received:", data.productSource);
                    throw new APIError(400, "Invalid product source type");
            }
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
            // Parse and convert includeInactive query parameter
            const includeInactiveRaw = req.query.includeInactive;
            const includeInactiveBool = includeInactiveRaw?.toString().toLowerCase() === 'true';

            // Fetch sections with products
            const sections = await this.homePageSectionService.getAllHomePageSections(includeInactiveBool);

            const sectionsWithRatings = await Promise.all(
                sections.map(async (section) => {
                    const productsWithRatings = await Promise.all(
                        section.products.map(async (product) => {
                            const { avg, count } = await this.reviewService.getAverageRating(product.id);
                            return {
                                ...product,
                                avgRating: avg,
                                reviewCount: count,
                            };
                        })
                    );
                    return {
                        ...section,
                        products: productsWithRatings,
                    };
                })
            );

            res.status(200).json({
                success: true,
                message: 'Home page sections retrieved successfully',
                data: sectionsWithRatings,
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

            const productsWithRatings = await Promise.all(
                section.products.map(async (product) => {
                    const avgRating = await this.reviewService.getAverageRating(product.id);
                    return { ...product, avgRating: avgRating.avg, count: avgRating.count };
                })
            );

            // Send success response
            res.status(200).json({
                success: true,
                message: 'Home page section retrieved successfully',
                data: productsWithRatings
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