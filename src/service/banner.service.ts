import { ILike, Repository } from "typeorm";
import {
    Banner,
    BannerStatus,
    BannerType,
    ProductSource,
} from "../entities/banner.entity";
import AppDataSource from "../config/db.config";
import { v2 as cloudinary } from "cloudinary";
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
import config from "../config/env.config";
import { Product } from "../entities/product.entity";

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

    constructor() {
        this.bannerRepository = AppDataSource.getRepository(Banner);
        this.categoryService = new CategoryService();
        this.subcategoryService = new SubcategoryService();
        this.dealService = new DealService();

        cloudinary.config({
            cloud_name: config.CLOUDINARY_CLOUD_NAME,
            api_key: config.CLOUDINARY_API_KEY,
            api_secret: config.CLOUDINARY_API_SECRET,
        });

        if (!cronScheduled) {
            cron.schedule("0 */5 * * *", async () => {
                await this.updateBannerStatuses();
            });
            cronScheduled = true;
        }
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
                const productService = new ProductService(AppDataSource);
                const products = await Promise.all(
                    dto.selectedProducts.map(async (id) => {
                        const product =
                            await productService.getProductDetailsById(id);
                        return product as unknown as Product;
                    }),
                );
                banner.selectedProducts = products;
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
        const banner = await this.bannerRepository.findOne({ where: { id } });

        if (!banner) {
            throw new APIError(404, "Banner not found");
        }

        if (dto.productSource) {
            banner.productSource = dto.productSource;

            switch (dto.productSource) {
                case ProductSource.MANUAL: {
                    if (!Array.isArray(dto.selectedProducts)) {
                        throw new APIError(
                            400,
                            "selectedProducts must be an array",
                        );
                    }
                    const productService = new ProductService(AppDataSource);
                    const products = await Promise.all(
                        dto.selectedProducts.map(async (productId) => {
                            const product =
                                await productService.getProductDetailsById(
                                    productId,
                                );
                            if (!product) {
                                throw new APIError(
                                    400,
                                    `Product with ID ${productId} does not exist`,
                                );
                            }
                            return product as unknown as Product;
                        }),
                    );
                    banner.selectedProducts = products;
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

    private extractPublicIdFromUrl(url: string): string | null {
        try {
            const parts = url.split("/");
            const file = parts[parts.length - 1].split(".")[0];
            const folderIdx = parts.findIndex((p) => p === "upload");
            if (folderIdx !== -1 && folderIdx < parts.length - 2) {
                const folderPath = parts.slice(folderIdx + 2, -1).join("/");
                return folderPath ? `${folderPath}/${file}` : file;
            }
            return file;
        } catch {
            return null;
        }
    }

    private async deleteCloudinaryImage(url: string): Promise<void> {
        if (!url || !url.includes("cloudinary.com")) return;
        const publicId = this.extractPublicIdFromUrl(url);
        if (!publicId) return;
        try {
            await cloudinary.uploader.destroy(publicId);
        } catch {
            // Silent fail for orphan cleanup
        }
    }

    async deleteBanner(id: number) {
        const banner = await this.bannerRepository.findOne({ where: { id } });
        if (banner) {
            if (banner.desktopImage) {
                await this.deleteCloudinaryImage(banner.desktopImage);
            }
            if (banner.mobileImage) {
                await this.deleteCloudinaryImage(banner.mobileImage);
            }
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
