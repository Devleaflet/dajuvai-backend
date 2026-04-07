import { Request, Response, NextFunction } from "express";
import { CreateBannerInput, UpdateBannerInput } from "../utils/zod_validations/banner.zod";
import { AuthRequest } from "../middlewares/auth.middleware";
import { BannerService } from "../service/banner.service";
import { BannerType, ProductSource } from "../entities/banner.entity";
import { ProductService } from "../service/product.service";
import { CategoryService } from "../service/category.service";
import { SubcategoryService } from "../service/subcategory.service";
import { DealService } from "../service/deal.service";
import AppDataSource from "../config/db.config";
import { BadRequestError, ConflictError, NotFoundError } from "../errors";

export class BannerController {
    private bannerService: BannerService;
    private productService: ProductService;
    private categoryService: CategoryService;
    private subcategoryService: SubcategoryService;
    private dealService: DealService;

    constructor() {
        this.bannerService = new BannerService();
        this.categoryService = new CategoryService();
        this.productService = new ProductService(AppDataSource);
        this.subcategoryService = new SubcategoryService();
        this.dealService = new DealService();
    }

    async createBanner(req: AuthRequest<{}, {}, CreateBannerInput>, res: Response, next: NextFunction): Promise<void> {
        const bannerData = req.body;
        const { productSource, selectedProducts, selectedCategoryId, selectedSubcategoryId, selectedDealId, externalLink } = bannerData;

        const bannernameExists = await this.bannerService.getBannerByName(bannerData.name);
        if (bannernameExists) throw new ConflictError("Banner with this name already exists");

        switch (productSource as ProductSource) {
            case ProductSource.MANUAL:
                if (!selectedProducts || selectedProducts.length === 0) throw new BadRequestError("At least one product must be selected for manual product source");
                const productIds = await Promise.all(
                    selectedProducts.map(async (productId) => {
                        const productExists = await this.productService.getProductDetailsById(productId);
                        if (!productExists) throw new BadRequestError(`Product with ID ${productId} does not exist`);
                        return productId;
                    })
                );
                const bannerManual = await this.bannerService.createBanner({ ...bannerData, selectedProducts: productIds }, req.user.id);
                res.status(201).json({ success: true, data: bannerManual });
                break;

            case ProductSource.CATEGORY:
                if (!selectedCategoryId) throw new BadRequestError("Selected category is required");
                const categoryExists = await this.categoryService.getCategoryById(selectedCategoryId);
                if (!categoryExists) throw new BadRequestError(`Category with ID ${selectedCategoryId} does not exist`);
                await this.bannerService.createBanner({ ...bannerData, selectedCategoryId }, req.user.id);
                res.status(201).json({ success: true, message: "Banner created with category" });
                break;

            case ProductSource.SUBCATEGORY:
                await this.bannerService.createBanner({ ...bannerData, selectedCategoryId, selectedSubcategoryId }, req.user.id);
                res.status(201).json({ success: true, message: "Banner created with subcategory" });
                break;

            case ProductSource.DEAL:
                const dealExists = await this.dealService.getDealById(selectedDealId);
                if (!dealExists) throw new BadRequestError(`Deal with ID ${selectedDealId} does not exist`);
                await this.bannerService.createBanner({ ...bannerData, selectedDealId }, req.user.id as number);
                res.status(201).json({ success: true, message: "Banner created with deal" });
                break;

            case ProductSource.EXTERNAL:
                if (!externalLink) throw new BadRequestError("External link is required");
                await this.bannerService.createBanner({ ...bannerData, externalLink }, req.user.id);
                res.status(201).json({ success: true, message: "Banner created with external link" });
                break;

            default:
                throw new BadRequestError("Invalid product source type");
        }
    }

    async updateBanner(req: AuthRequest<{ id: number }, {}, UpdateBannerInput>, res: Response, next: NextFunction): Promise<void> {
        const { id } = req.params;
        const bannerData = req.body;

        const existingBanner = await this.bannerService.getBannerById(Number(id));
        if (!existingBanner) throw new NotFoundError("Banner");

        const newStartDate = new Date(req.body.startDate);
        newStartDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const existingStartDate = new Date(existingBanner.startDate);
        existingStartDate.setHours(0, 0, 0, 0);

        if (newStartDate.getTime() !== existingStartDate.getTime() && newStartDate < today) {
            throw new BadRequestError("Start date must be today or in the future");
        }

        if (bannerData.productSource) {
            switch (bannerData.productSource) {
                case ProductSource.MANUAL:
                    if (!bannerData.selectedProducts?.length) throw new BadRequestError("At least one product is required for manual product source");
                    break;
                case ProductSource.CATEGORY:
                    if (!bannerData.selectedCategoryId) throw new BadRequestError("Category ID required for category product source");
                    break;
                case ProductSource.SUBCATEGORY:
                    if (!bannerData.selectedSubcategoryId) throw new BadRequestError("Subcategory ID required for subcategory product source");
                    break;
                case ProductSource.DEAL:
                    if (!bannerData.selectedDealId) throw new BadRequestError("Deal ID required for deal product source");
                    break;
                case ProductSource.EXTERNAL:
                    if (!bannerData.externalLink) throw new BadRequestError("External link required for external product source");
                    break;
                default:
                    throw new BadRequestError("Invalid product source type");
            }
        }

        const banner = await this.bannerService.updateBanner(Number(id), bannerData, req.user.id);
        res.status(200).json({ success: true, data: banner });
    }

    async getBannerById(req: Request<{ id: string }>, res: Response, _next: NextFunction): Promise<void> {
        const banner = await this.bannerService.getBannerById(Number(req.params.id));
        res.status(200).json({ success: true, data: banner });
    }

    async getAllBanners(req: Request<{}, {}, {}, { type: BannerType }>, res: Response, _next: NextFunction): Promise<void> {
        const banners = await this.bannerService.getAllBanners(req.query.type);
        res.status(200).json({ success: true, data: banners });
    }

    async deleteBanner(req: Request<{ id: number }>, res: Response, _next: NextFunction): Promise<void> {
        const { id } = req.params;
        const banner = await this.bannerService.getBannerById(Number(id));
        if (!banner) throw new NotFoundError(`Banner with id: ${id}`);

        await this.bannerService.deleteBanner(id);
        res.status(200).json({ success: true, message: `Banner with id: ${id} deleted successfully` });
    }

    async searchBannerByBannerName(req: Request<{ bannerName: string }>, res: Response, next: NextFunction): Promise<void> {
        const { bannerName } = req.params;
        if (!bannerName) return next(new BadRequestError("Banner name must not be empty"));

        const banner = await this.bannerService.searchBannersByName(bannerName);
        if (!banner) throw new NotFoundError("Banner");

        res.status(200).json({ success: true, data: banner });
    }
}
