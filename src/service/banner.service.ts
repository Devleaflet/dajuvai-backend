import { ILike, In, Repository } from "typeorm";
import {
    Banner,
    BannerStatus,
    BannerType,
    ProductSource,
} from "../entities/banner.entity";
import AppDataSource from "../config/db.config";
import {
    CreateBannerInput,
    UpdateBannerInput,
} from "../utils/zod_validations/banner.zod";
import { APIError } from "../utils/ApiError.utils";
import cron from "node-cron";
import { ProductService } from "./product.service";
import { CategoryService } from "./category.service";
import { DealService } from "./deal.service";
import { SubcategoryService } from "./subcategory.service";
import { CloudinaryService } from "./image.service";
import { Product } from "../entities/product.entity";
import { normalizeManualBannerProductIds } from "../utils/bannerProductSelection";

let cronScheduled = false;

/**
 * BannerService handles all banner-related business logic.
 */
export class BannerService {
    private bannerRepository: Repository<Banner>;
    private productService: ProductService;
    private categoryService: CategoryService;
    private subcategoryService: SubcategoryService;
    private dealService: DealService;
    private cloudinaryService: CloudinaryService;

    constructor() {
        this.bannerRepository = AppDataSource.getRepository(Banner);
        this.categoryService = new CategoryService();
        this.subcategoryService = new SubcategoryService();
        this.dealService = new DealService();
        this.cloudinaryService = new CloudinaryService();

        if (!cronScheduled) {
            cron.schedule("0 */5 * * *", async () => {
                await this.updateBannerStatuses();
            });
            cronScheduled = true;
        }
    }

    private async resolveManualProducts(
        selectedProducts: unknown,
    ): Promise<Product[]> {
        const ids = normalizeManualBannerProductIds(selectedProducts);
        if (!ids.length) {
            throw new APIError(400, "At least one valid product must be selected");
        }

        const products = await AppDataSource.getRepository(Product).find({
            where: { id: In(ids) },
            select: { id: true },
        });
        if (products.length !== ids.length) {
            const found = new Set(products.map((product) => product.id));
            const missing = ids.filter((id) => !found.has(id));
            throw new APIError(400, `Selected product no longer exists: ${missing.join(", ")}`);
        }

        const byId = new Map(products.map((product) => [product.id, product]));
        return ids.map((id) => byId.get(id)!);
    }

    async createBanner(dto: CreateBannerInput, adminId: number) {
        const status = this.determineStatus(
            new Date(dto.startDate),
            new Date(dto.endDate),
        );

        const banner = this.bannerRepository.create({
            name: dto.name,
            desktopImage: dto.desktopImage,
            mobileImage: dto.mobileImage ? dto.mobileImage : null,
            status,
            type: dto.type,
            startDate: new Date(dto.startDate),
            endDate: new Date(dto.endDate),
            createdById: adminId,
            placementAfterSection:
                dto.type === BannerType.SIDEBAR
                    ? (dto.placementAfterSection ?? 3)
                    : null,
        });

        switch (dto.productSource) {
            case ProductSource.MANUAL: {
                banner.selectedProducts = await this.resolveManualProducts(dto.selectedProducts);
                break;
            }

            case ProductSource.CATEGORY: {
                const category = await this.categoryService.getCategoryById(
                    dto.selectedCategoryId,
                );
                banner.selectedCategory = category;
                break;
            }

            case ProductSource.SUBCATEGORY: {
                const subcategory =
                    await this.subcategoryService.handleGetSubcategoryById(
                        dto.selectedSubcategoryId,
                    );
                banner.selectedSubcategory = subcategory;
                break;
            }

            case ProductSource.DEAL: {
                const deal = await this.dealService.getDealById(
                    dto.selectedDealId,
                );
                banner.selectedDeal = deal;
                break;
            }

            case ProductSource.EXTERNAL: {
                banner.externalLink = dto.externalLink;
                break;
            }

            default:
                throw new APIError(400, "Invalid product source");
        }

        banner.productSource = dto.productSource;

        const savedBanner = await this.bannerRepository.save(banner);
        return savedBanner;
    }

    async updateBanner(
        id: number,
        dto: UpdateBannerInput,
        adminId?: number,
    ): Promise<Banner> {
        const banner = await this.bannerRepository.findOne({
            where: { id },
            relations: ["selectedProducts"],
        });

        if (!banner) {
            throw new APIError(404, "Banner not found");
        }

        if (dto.productSource) {
            banner.productSource = dto.productSource;

            switch (dto.productSource) {
                case ProductSource.MANUAL: {
                    banner.selectedProducts = await this.resolveManualProducts(dto.selectedProducts);
                    break;
                }

                case ProductSource.CATEGORY: {
                    const category =
                        await this.categoryService.getCategoryById(
                            dto.selectedCategoryId,
                        );
                    banner.selectedCategory = category;
                    break;
                }

                case ProductSource.SUBCATEGORY: {
                    const subcat =
                        await this.subcategoryService.handleGetSubcategoryById(
                            dto.selectedSubcategoryId,
                        );
                    banner.selectedSubcategory = subcat;
                    break;
                }

                case ProductSource.DEAL: {
                    const deal = await this.dealService.getDealById(
                        dto.selectedDealId,
                    );
                    banner.selectedDeal = deal;
                    break;
                }

                case ProductSource.EXTERNAL: {
                    banner.externalLink = dto.externalLink;
                    break;
                }
            }
        }

        banner.name = dto.name ?? banner.name;
        banner.desktopImage = dto.desktopImage ?? banner.desktopImage;
        banner.mobileImage = dto.mobileImage ?? banner.mobileImage;
        banner.type = dto.type ?? banner.type;
        banner.startDate = dto.startDate
            ? new Date(dto.startDate)
            : banner.startDate;
        banner.endDate = dto.endDate
            ? new Date(dto.endDate)
            : banner.endDate;
        banner.status = this.determineStatus(
            banner.startDate,
            banner.endDate,
        );
        banner.createdById = adminId || banner.createdById;

        if (dto.placementAfterSection !== undefined) {
            banner.placementAfterSection = dto.placementAfterSection;
        }
        if (banner.type !== BannerType.SIDEBAR) {
            banner.placementAfterSection = null;
        } else if (banner.placementAfterSection == null) {
            banner.placementAfterSection = 3;
        }

        const savedBanner = await this.bannerRepository.save(banner);
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
                "placementAfterSection",
                "externalLink",
                "createdById",
            ],
            relations: [
                "createdBy",
                "selectedProducts",
                "selectedProducts.variants",
                "selectedCategory",
                "selectedSubcategory",
                "selectedDeal",
            ],
        });

        if (!banner) {
            throw new APIError(404, "Banner not found");
        }

        return banner;
    }

    async getAllBanners(type?: BannerType): Promise<Banner[]> {
        const whereClause = type ? { type } : {};

        const banners = await this.bannerRepository.find({
            where: whereClause,
            relations: [
                "createdBy",
                "selectedProducts",
                "selectedProducts.variants",
                "selectedProducts.subcategory",
                "selectedProducts.subcategory.category",
                "selectedCategory",
                "selectedSubcategory",
                "selectedSubcategory.category",
                "selectedDeal",
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
                placementAfterSection: true,
                externalLink: true,
                createdBy: {
                    id: true,
                    fullName: true,
                    username: true,
                    email: true,
                    phoneNumber: true,
                    role: true,
                },
                selectedProducts: {
                    id: true,
                },
                selectedCategory: {
                    id: true,
                    name: true,
                },
                selectedDeal: {
                    id: true,
                    name: true,
                },
                selectedSubcategory: {
                    id: true,
                    name: true,
                    image: true,
                    category: {
                        id: true,
                        name: true,
                    },
                },
            },
        });

        return banners.map((banner) => {
            if (banner.createdBy) {
                delete (banner.createdBy as any).address;
            }
            return banner;
        });
    }

    private determineStatus(startDate: Date, endDate: Date): BannerStatus {
        const now = new Date();

        if (now < startDate) {
            return BannerStatus.SCHEDULED;
        }

        if (!endDate) {
            return BannerStatus.ACTIVE;
        }

        if (now >= startDate && now <= endDate) {
            return BannerStatus.ACTIVE;
        }

        return BannerStatus.EXPIRED;
    }

    async updateBannerStatuses(): Promise<void> {
        const banners = await this.bannerRepository.find();

        for (const banner of banners) {
            const newStatus = this.determineStatus(
                banner.startDate,
                banner.endDate,
            );

            if (newStatus !== banner.status) {
                await this.bannerRepository.update(banner.id, {
                    status: newStatus,
                });
            }
        }
    }

    /**
     * Deletes all banner images in one batched Cloudinary call (spec OPT-9),
     * with CDN invalidation and logged — not swallowed — failures.
     */
    private async deleteBannerImages(
        urls: (string | null | undefined)[],
    ): Promise<void> {
        const targets = urls.filter(
            (url): url is string =>
                Boolean(url && url.includes("cloudinary.com")),
        );
        if (targets.length === 0) return;

        const results = await this.cloudinaryService.deleteManyByUrls(targets);
        for (const result of results) {
            if (!result.success) {
                console.warn(
                    `[BannerService] Image cleanup failed for ${result.publicId || "unknown"}: ${result.error}`,
                );
            }
        }
    }

    async deleteBanner(id: number) {
        const banner = await this.bannerRepository.findOne({ where: { id } });
        if (banner) {
            await this.deleteBannerImages([
                banner.desktopImage,
                banner.mobileImage,
            ]);
        }
        return await this.bannerRepository.delete(id);
    }

    async searchBannersByName(name: string): Promise<Banner[]> {
        try {
            return await this.bannerRepository.find({
                where: {
                    name: ILike(`%${name}%`),
                },
                relations: ["createdBy"],
            });
        } catch (err) {
            throw new APIError(500, "Database error during banner search");
        }
    }

    async getBannerByName(name: string) {
        return await this.bannerRepository.findOne({
            where: {
                name: name,
            },
        });
    }
}
