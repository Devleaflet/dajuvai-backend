import { Request, Response, NextFunction } from 'express';
import { HomePageSectionService } from '../service/homePageSection.service';
import { ReviewService } from '../service/review.service';
import { ProductController } from './product.controller';
import { DataSource, In } from 'typeorm';
import AppDataSource from '../config/db.config';
import { ICreateHomepageSectionInput } from '../interface/homepage.interface';
import { ProductSource } from '../entities/banner.entity';
import { ProductService } from '../service/product.service';
import { CategoryService } from '../service/category.service';
import { SubcategoryService } from '../service/subcategory.service';
import { DealService } from '../service/deal.service';
import { Product } from '../entities/product.entity';
import { BadRequestError, ConflictError, NotFoundError } from '../errors';

/**
 * @class HomePageSectionController
 * @description Manages homepage section operations: create, update, retrieve, delete, and status toggling.
 */
export class HomePageSectionController {
    private homePageSectionService: HomePageSectionService;
    private reviewService: ReviewService;
    private productController: ProductController;
    private productService: ProductService;
    private categoryService: CategoryService;
    private subcategoryService: SubcategoryService;
    private dealService: DealService;

    constructor() {
        this.homePageSectionService = new HomePageSectionService();
        this.reviewService = new ReviewService();
        this.productController = new ProductController(AppDataSource);
        this.productService = new ProductService(AppDataSource);
        this.categoryService = new CategoryService();
        this.subcategoryService = new SubcategoryService();
        this.dealService = new DealService();
    }

    /**
     * @method createHomePageSection
     * @route POST /api/homepage-sections
     * @access Admin and staff
     */
    createHomePageSection = async (req: Request<{}, {}, ICreateHomepageSectionInput, {}>, res: Response, _next: NextFunction): Promise<void> => {
        const data: ICreateHomepageSectionInput = req.body;

        const existingSection = await this.homePageSectionService.checkByTitle(data.title);
        if (existingSection) throw new ConflictError("Section with this title already exists");

        switch (data.productSource) {
            case ProductSource.MANUAL: {
                const uniqueProductIds = [...new Set((data.productIds || []).map(Number))].filter(
                    (id) => Number.isFinite(id)
                );

                if (uniqueProductIds.length) {
                    const productsCount = await AppDataSource.getRepository(Product).count({
                        where: { id: In(uniqueProductIds) },
                    });

                    if (productsCount !== uniqueProductIds.length) {
                        throw new NotFoundError("Product");
                    }
                }

                const homepageManual = await this.homePageSectionService.createHomePageSection(data);
                res.status(201).json({ success: true, homepage: homepageManual });
                break;
            }

            case ProductSource.CATEGORY: {
                const categoryExists = await this.categoryService.getCategoryById(data.selectedCategoryId);
                if (!categoryExists) throw new NotFoundError("Selected category");

                const homepagecategory = await this.homePageSectionService.createHomePageSection(data);
                res.status(201).json({ success: true, homepage: homepagecategory });
                break;
            }

            case ProductSource.SUBCATEGORY: {
                const subcategoryExists = await this.subcategoryService.handleGetSubcategoryById(data.selectedSubcategoryId);
                if (!subcategoryExists) throw new NotFoundError("Selected subcategory");

                const homepagesubcategory = await this.homePageSectionService.createHomePageSection(data);
                res.status(201).json({ success: true, homepage: homepagesubcategory });
                break;
            }

            case ProductSource.DEAL: {
                const dealExists = await this.dealService.handleGetDealById(data.selectedDealId);
                if (!dealExists) throw new NotFoundError("Selected deal");

                const homepagedeal = await this.homePageSectionService.createHomePageSection(data);
                res.status(201).json({ success: true, homepage: homepagedeal });
                break;
            }

            default:
                throw new BadRequestError("Invalid product source type");
        }
    };

    /**
     * @method updateHomePageSection
     * @route PUT /api/homepage-sections/:id
     * @access Admin and staff
     */
    updateHomePageSection = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) throw new BadRequestError('Valid section ID is required');

        const { title, isActive, productIds, productSource, selectedCategoryId, selectedSubcategoryId, selectedDealId } = req.body;

        const updatePayload = {
            sectionId: Number(id),
            title,
            isActive,
            productIds,
            productSource,
            selectedCategoryId,
            selectedSubcategoryId,
            selectedDealId,
        };

        const section = await this.homePageSectionService.updateHomePageSection(updatePayload);

        res.status(200).json({ success: true, message: 'Home page section updated successfully', data: section });
    };

    /**
     * @method getAllHomePageSections
     * @route GET /api/homepage-sections
     * @access Public
     */
    getAllHomePageSections = async (req: Request<{}, {}, {}, { search: string, includeInactive: boolean }>, res: Response, _next: NextFunction): Promise<void> => {
        const includeInactiveRaw = req.query.includeInactive;
        const includeInactiveBool = includeInactiveRaw?.toString().toLowerCase() === 'true';

        const sections = await this.homePageSectionService.getAllHomePageSections(includeInactiveBool, req.query.search);

        const allProductIds = [
            ...new Set(sections.flatMap((section) => section.products?.map((p) => p.id) ?? [])),
        ];

        const ratingsMap = await this.reviewService.getBatchAverageRatings(allProductIds);

        const sectionsWithRatings = sections.map((section) => {
            const productsWithRatings = (section.products ?? []).map((product) => {
                const ratings = ratingsMap.get(product.id) ?? { avg: 0, count: 0 };
                return { ...product, avgRating: ratings.avg, reviewCount: ratings.count };
            });

            return { ...section, products: productsWithRatings };
        });

        res.status(200).json({ success: true, message: 'Home page sections retrieved successfully', data: sectionsWithRatings });
    };

    /**
     * @method getHomePageSectionById
     * @route GET /api/homepage-sections/:id
     * @access Public
     */
    getHomePageSectionById = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) throw new BadRequestError('Valid section ID is required');

        const section = await this.homePageSectionService.getHomePageSectionById(Number(id));

        const productIds = (section.products ?? []).map((p) => p.id);
        const ratingsMap = await this.reviewService.getBatchAverageRatings(productIds);

        const productsWithRatings = (section.products ?? []).map((product) => {
            const ratings = ratingsMap.get(product.id) ?? { avg: 0, count: 0 };
            return { ...product, avgRating: ratings.avg, count: ratings.count };
        });

        res.status(200).json({ success: true, message: 'Home page section retrieved successfully', data: productsWithRatings });
    };

    /**
     * @method deleteHomePageSection
     * @route DELETE /api/homepage-sections/:id
     * @access Admin
     */
    deleteHomePageSection = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) throw new BadRequestError('Valid section ID is required');

        const result = await this.homePageSectionService.deleteHomePageSection(Number(id));

        res.status(200).json({ success: true, message: result.message });
    };

    /**
     * @method toggleSectionStatus
     * @route PATCH /api/homepage-sections/:id/status
     * @access Admin and staff
     */
    toggleSectionStatus = async (req: Request, res: Response, _next: NextFunction): Promise<void> => {
        const { id } = req.params;
        if (!id || isNaN(Number(id))) throw new BadRequestError('Valid section ID is required');

        const section = await this.homePageSectionService.toggleSectionStatus(Number(id));

        res.status(200).json({ success: true, message: 'Section status toggled successfully', data: section });
    };
}
