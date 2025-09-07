import { ILike, Repository } from 'typeorm';
import { Banner, BannerStatus, ProductSource } from '../entities/banner.entity';
import AppDataSource from '../config/db.config';
import { v2 as cloudinary } from 'cloudinary';
import { CreateBannerInput, UpdateBannerInput } from '../utils/zod_validations/banner.zod';
import { APIError } from '../utils/ApiError.utils';
import cron from 'node-cron';
import { ProductService } from './product.service';
import { CategoryService } from './category.service';
import { DealService } from './deal.service';
import { SubcategoryService } from './subcategory.service';



/**
 * BannerService handles all banner-related business logic.
 * This includes CRUD operations, Cloudinary image handling,
 * automatic status updates using a cron job, and search.
 * 
 * @module Services/Banner
 */
export class BannerService {
    private bannerRepository: Repository<Banner>;
    private productService: ProductService;
    private categoryService: CategoryService;
    private subcategoryService: SubcategoryService;
    private dealService: DealService;

    /**
     * Constructor initializes the repository and sets up Cloudinary configuration and cron jobs.
     */
    constructor() {
        this.bannerRepository = AppDataSource.getRepository(Banner);
        this.categoryService = new CategoryService()
        this.subcategoryService = new SubcategoryService()
        this.dealService = new DealService()


        // Configure Cloudinary using environment variables
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });

        // Schedule cron job to auto-update banner statuses every 5 hours
        cron.schedule('0 */5 * * *', async () => {
            await this.updateBannerStatuses();
        });
    }

    /**
     * Create a new banner with image upload to Cloudinary.
     * 
     * @param dto {CreateBannerInput} - DTO containing banner fields
     * @param file {Express.Multer.File} - Image file to be uploaded
     * @param adminId {number} - ID of the admin creating the banner
     * @returns {Promise<Banner>} - Created Banner entity
     * @throws {APIError} - If image is missing, duplicate name exists, or upload fails
     * @access Admin
     */
    async createBanner(dto: CreateBannerInput, adminId: number) {
        console.log("🟢 [createBanner] DTO received:", dto);
        console.log("🟢 [createBanner] Admin ID:", adminId);

        const status = this.determineStatus(new Date(dto.startDate), new Date(dto.endDate));
        console.log("🟢 [createBanner] Computed Status:", status);

        const banner = this.bannerRepository.create({
            name: dto.name,
            desktopImage: dto.desktopImage,
            mobileImage: dto.mobileImage ? dto.mobileImage : null,
            status,
            type: dto.type,
            startDate: new Date(dto.startDate),
            endDate: new Date(dto.endDate),
            createdById: adminId,
        });

        console.log("🟢 [createBanner] Initial banner entity:", banner);

        switch (dto.productSource) {
            case ProductSource.MANUAL:
                console.log("🟢 [createBanner] ProductSource = MANUAL");

                const products = await Promise.all(
                    dto.selectedProducts.map(async (id) => {
                        console.log("   🔹 Fetching product by ID:", id);
                        const productService = new ProductService(AppDataSource)
                        const product = await productService.getProductDetailsById(id);
                        console.log("   🔹 Product fetched:", product?.id);
                        return product;
                    })
                );
                banner.selectedProducts = products;
                console.log("🟢 [createBanner] Assigned products:", products.map(p => p.id));

                break;

            case ProductSource.CATEGORY:
                console.log("🟢 [createBanner] ProductSource = CATEGORY");
                const category = await this.categoryService.getCategoryById(dto.selectedCategoryId);
                console.log("   🔹 Category fetched:", category?.id);
                banner.selectedCategory = category;
                break;

            case ProductSource.SUBCATEGORY:
                console.log("🟢 [createBanner] ProductSource = SUBCATEGORY");
                const subcategory = await this.subcategoryService.handleGetSubcategoryById(dto.selectedSubcategoryId);
                console.log("   🔹 Subcategory fetched:", subcategory?.id);
                banner.selectedSubcategory = subcategory;
                break;

            case ProductSource.DEAL:
                console.log("🟢 [createBanner] ProductSource = DEAL");
                const deal = await this.dealService.getDealById(dto.selectedDealId);
                console.log("   🔹 Deal fetched:", deal?.id);
                banner.selectedDeal = deal;
                break;

            case ProductSource.EXTERNAL:
                console.log("🟢 [createBanner] ProductSource = EXTERNAL");
                banner.externalLink = dto.externalLink;
                console.log("   🔹 External link set:", dto.externalLink);
                break;

            default:
                console.error("🔴 [createBanner] Invalid product source:", dto.productSource);
                throw new APIError(400, 'Invalid product source');
        }

        console.log("🟢 [createBanner] Final banner before save:", banner);

        banner.productSource = dto.productSource

        const savedBanner = await this.bannerRepository.save(banner);
        console.log("🟢 [createBanner] Banner saved:", savedBanner);

        return savedBanner;
    }


    /**
 * Update an existing banner by its ID.
 * Supports optional image replacement using Cloudinary.
 * 
 * @param id {number} - ID of the banner to update
 * @param dto {UpdateBannerInput} - DTO containing updatable fields
 * @param file {Express.Multer.File} [optional] - New image file (if provided)
 * @param adminId {number} [optional] - Admin ID performing the update
 * @returns {Promise<Banner>} - Updated banner entity
 * @throws {APIError} - If banner is not found, image upload fails, or other update errors occur
 * @access Admin
 */
    async updateBanner(
        id: number,
        dto: UpdateBannerInput,
        adminId?: number
    ): Promise<Banner> {
        console.log('[BannerService.updateBanner] start', { id, dto, adminId });

        const banner = await this.bannerRepository.findOne({ where: { id } });
        console.log('[BannerService.updateBanner] found banner:', banner);

        if (!banner) {
            console.error('[BannerService.updateBanner] Banner not found for id:', id);
            throw new APIError(404, 'Banner not found');
        }

        // Update productSource first
        if (dto.productSource) {
            console.log('[BannerService.updateBanner] productSource provided:', dto.productSource);
            banner.productSource = dto.productSource; // <-- Fix: update productSource in DB

            switch (dto.productSource) {
                case ProductSource.MANUAL: {
                    console.log('[BannerService.updateBanner] MANUAL selectedProducts:', dto.selectedProducts);
                    if (!Array.isArray(dto.selectedProducts)) {
                        console.error('[BannerService.updateBanner] selectedProducts is not an array', dto.selectedProducts);
                        throw new APIError(400, 'selectedProducts must be an array');
                    }

                    const productService = new ProductService(AppDataSource);
                    const products = await Promise.all(
                        dto.selectedProducts.map(async (productId) => {
                            console.log(`[BannerService.updateBanner] fetching product id=${productId}`);
                            const product = await productService.getProductDetailsById(productId);
                            if (!product) {
                                console.error(`[BannerService.updateBanner] product not found id=${productId}`);
                                throw new APIError(400, `Product with ID ${productId} does not exist`);
                            }
                            console.log(`[BannerService.updateBanner] found product id=${productId} name=${product.name}`);
                            return product;
                        })
                    );
                    banner.selectedProducts = products;
                    console.log('[BannerService.updateBanner] banner.selectedProducts set, count=', products.length);
                    break;
                }

                case ProductSource.CATEGORY: {
                    console.log('[BannerService.updateBanner] CATEGORY -> selectedCategoryId:', dto.selectedCategoryId);
                    const category = await this.categoryService.getCategoryById(dto.selectedCategoryId);
                    banner.selectedCategory = category;
                    console.log('[BannerService.updateBanner] banner.selectedCategory set:', category?.id ?? null);
                    break;
                }

                case ProductSource.SUBCATEGORY: {
                    console.log('[BannerService.updateBanner] SUBCATEGORY -> selectedSubcategoryId:', dto.selectedSubcategoryId);
                    const subcat = await this.subcategoryService.handleGetSubcategoryById(dto.selectedSubcategoryId);
                    banner.selectedSubcategory = subcat;
                    console.log('[BannerService.updateBanner] banner.selectedSubcategory set:', subcat?.id ?? null);
                    break;
                }

                case ProductSource.DEAL: {
                    console.log('[BannerService.updateBanner] DEAL -> selectedDealId:', dto.selectedDealId);
                    const deal = await this.dealService.getDealById(dto.selectedDealId);
                    banner.selectedDeal = deal;
                    console.log('[BannerService.updateBanner] banner.selectedDeal set:', deal?.id ?? null);
                    break;
                }

                case ProductSource.EXTERNAL: {
                    console.log('[BannerService.updateBanner] EXTERNAL -> externalLink:', dto.externalLink);
                    banner.externalLink = dto.externalLink;
                    break;
                }

                default:
                    console.log('[BannerService.updateBanner] unhandled productSource:', dto.productSource);
            }
        } else {
            console.log('[BannerService.updateBanner] No productSource in request body; proceeding with base updates only.');
        }

        // update base fields with debug logs showing previous vs new
        const before = {
            name: banner.name,
            desktopImage: banner.desktopImage,
            mobileImage: banner.mobileImage,
            type: banner.type,
            startDate: banner.startDate,
            endDate: banner.endDate,
        };
        console.log('[BannerService.updateBanner] before update:', before);

        banner.name = dto.name ?? banner.name;
        banner.desktopImage = dto.desktopImage ?? banner.desktopImage;
        banner.mobileImage = dto.mobileImage ?? banner.mobileImage;
        banner.type = dto.type ?? banner.type;
        banner.startDate = dto.startDate ? new Date(dto.startDate) : banner.startDate;
        banner.endDate = dto.endDate ? new Date(dto.endDate) : banner.endDate;

        const after = {
            name: banner.name,
            desktopImage: banner.desktopImage,
            mobileImage: banner.mobileImage,
            type: banner.type,
            startDate: banner.startDate,
            endDate: banner.endDate,
        };
        console.log('[BannerService.updateBanner] after update:', after);

        // update status 
        banner.status = this.determineStatus(banner.startDate, banner.endDate);
        console.log('[BannerService.updateBanner] computed status:', banner.status);

        banner.createdById = adminId || banner.createdById;
        console.log('[BannerService.updateBanner] createdById set to:', banner.createdById);

        console.log('[BannerService.updateBanner] saving banner...');
        const savedBanner = await this.bannerRepository.save(banner);
        console.log('[BannerService.updateBanner] savedBanner:', savedBanner);

        return savedBanner;
    }




    async getBannerById(id: number): Promise<Banner> {
        const banner = await this.bannerRepository.findOne({
            where: { id },
            select: [
                "id",
                "name",
                "desktopImage",
                "mobileImage",
                "type",
                "status",
                "startDate",
                "endDate",
                "productSource",
                "externalLink",
                "createdById",
            ],
            relations: [
                "createdBy",
                "selectedProducts",
                "selectedCategory",
                "selectedSubcategory"
            ]
        });

        if (!banner) {
            throw new APIError(404, "Banner not found");
        }

        return banner;
    }


    /**
     * Fetch all banners including the creator of each banner.
     *
     * @returns {Promise<Banner[]>} - List of all banners with creator relation
     * @access Admin
     */
    async getAllBanners(): Promise<Banner[]> {
        const banners = await this.bannerRepository.find({
            relations: [
                "createdBy",
                "selectedProducts",
                "selectedProducts.variants",
                "selectedProducts.subcategory",
                "selectedProducts.subcategory.category",
                "selectedCategory",
                "selectedSubcategory",
            ],
            select: {
                id: true,
                name: true,
                desktopImage: true,
                mobileImage: true,
                type: true,
                status: true,
                startDate: true,
                endDate: true,
                productSource: true,
                externalLink: true,
                createdBy: {
                    id: true,
                    fullName: true,
                    username: true,
                    email: true,
                    phoneNumber: true,
                    role: true,
                },
            },
        });

        // remove address details 
        return banners.map(banner => {
            if (banner.createdBy) {
                delete (banner.createdBy as any).address;
            }
            return banner;
        });
    }




    /**
     * Determine the status of a banner based on start and end dates.
     *
     * @param startDate {Date} - Banner's start date
     * @param endDate {Date} - Banner's end date
     * @returns {BannerStatus} - One of: SCHEDULED, ACTIVE, or EXPIRED
     * @access Internal
     */
    private determineStatus(startDate: Date, endDate: Date): BannerStatus {
        const now = new Date();

        if (now < startDate) {
            return BannerStatus.SCHEDULED;
        } else if (now >= startDate && now <= endDate) {
            return BannerStatus.ACTIVE;
        } else {
            return BannerStatus.EXPIRED;
        }
    }

    /**
     * Automatically update statuses of all banners based on current date.
     * This method is triggered by a cron job every 5 hours.
     *
     * @returns {Promise<void>}
     * @access Internal (Cron job)
     */
    async updateBannerStatuses(): Promise<void> {
        const banners = await this.bannerRepository.find();

        for (const banner of banners) {
            const newStatus = this.determineStatus(banner.startDate, banner.endDate);

            if (newStatus !== banner.status) {
                await this.bannerRepository.update(banner.id, { status: newStatus });
            }
        }
    }

    /**
     * Delete a banner by its ID.
     *
     * @param id {number} - The ID of the banner to delete
     * @returns {Promise<DeleteResult>} - TypeORM delete result
     * @access Admin
     */
    async deleteBanner(id: number) {
        return await this.bannerRepository.delete(id);
    }

    /**
     * Search banners by name using case-insensitive partial match.
     *
     * @param name {string} - The name (or part of it) to search
     * @returns {Promise<Banner[]>} - List of matching banners
     * @throws {APIError} - If database error occurs during search
     * @access Admin
     */
    async searchBannersByName(name: string): Promise<Banner[]> {
        try {
            return await this.bannerRepository.find({
                where: {
                    name: ILike(`%${name}%`)
                },
                relations: ['createdBy'],
            });
        } catch (err) {
            console.error("DB error in searchBannersByName:", err);
            throw new APIError(500, "Database error during banner search");
        }
    }

    async getBannerByName(name: string) {
        return await this.bannerRepository.findOne({
            where: {
                name: name
            }
        })
    }
}
