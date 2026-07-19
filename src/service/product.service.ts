import { Brackets, DataSource, Repository, Not, In } from "typeorm";
import { Product } from "../entities/product.entity";
import { Subcategory } from "../entities/subcategory.entity";
import { User, UserRole } from "../entities/user.entity";
import { v2 as cloudinary } from "cloudinary";
import { APIError } from "../utils/ApiError.utils";
import { Vendor } from "../entities/vendor.entity";
import { VendorService } from "./vendor.service";
import {
  IProductQueryParams,
  IAdminProductQueryParams,
} from "../interface/product.interface";
import { Deal, DealStatus } from "../entities/deal.entity";
import { ImageUploadService } from "./image.upload.service";
import { ImageDeletionService } from "./image.delete.service";
import { Category } from "../entities/category.entity";
import { Brand } from "../entities/brand.entity";
import { Banner } from "../entities/banner.entity";
import {
  InventoryStatus,
  ProductInterface,
} from "../utils/zod_validations/product.zod";
import { CategoryService } from "./category.service";
import { BannerService } from "./banner.service";
import { DealService } from "./deal.service";
import { SubcategoryService } from "./subcategory.service";
import { MulterFile } from "../config/multer.config";
import { Variant } from "../entities/variant.entity";
import config from "../config/env.config";
import { DiscountType } from "../entities/product.enum";
import { OrderStatus } from "../entities/order.entity";
import { sanitizeVendor } from "../utils/sanitize.util";
import { calculatePriceSnapshot } from "../utils/pricing.utils";

/**
 * Service class for handling product-related operations.
 *
 * This includes managing products, categories, subcategories,
 * vendors, deals, brands, and associated image upload and deletion.
 *
 * It interacts with respective repositories and auxiliary services
 * such as VendorService and image management services.
 *
 * @module Product Management
 */
export class ProductService {
  private productRepository: Repository<Product>;
  private categoryRepository: Repository<Category>;
  private subcategoryRepository: Repository<Subcategory>;
  private userRepository: Repository<User>;
  private vendorRepository: Repository<Vendor>;
  private dealRepository: Repository<Deal>;
  private brandRepository: Repository<Brand>;
  private vendorService: VendorService;
  private imageUploadService: ImageUploadService;
  private imageDeletionService: ImageDeletionService;
  private bannerRepository: Repository<Banner>;
  private categoryService: CategoryService;
  private subcategoryService: SubcategoryService;
  private bannerService: BannerService;
  private dealService: DealService;
  private variantRepository: Repository<Variant>;

  constructor(private dataSource: DataSource) {
    this.productRepository = this.dataSource.getRepository(Product);
    this.categoryRepository = this.dataSource.getRepository(Category);
    this.subcategoryRepository = this.dataSource.getRepository(Subcategory);
    this.userRepository = this.dataSource.getRepository(User);
    this.vendorRepository = this.dataSource.getRepository(Vendor);
    this.dealRepository = this.dataSource.getRepository(Deal);
    this.brandRepository = this.dataSource.getRepository(Brand);
    this.bannerRepository = this.dataSource.getRepository(Banner);
    this.vendorService = new VendorService();
    this.imageUploadService = new ImageUploadService();
    this.imageDeletionService = new ImageDeletionService();
    this.categoryService = new CategoryService();
    this.subcategoryService = new SubcategoryService();
    this.bannerService = new BannerService();
    this.dealService = new DealService();
    this.variantRepository = this.dataSource.getRepository(Variant);
    cloudinary.config({
      cloud_name: config.CLOUDINARY_CLOUD_NAME,
      api_key: config.CLOUDINARY_API_KEY,
      api_secret: config.CLOUDINARY_API_SECRET,
    });
  }

  async getAlllProducts(page: number = 1, limit: number = 50) {
    const products = await this.productRepository.find({
      relations: ["subcategory", "vendor", "deal", "reviews"],
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    const sanitizedProducts = products.map((p) => ({
      ...p,
      vendor: p.vendor ? sanitizeVendor(p.vendor) : null,
    }));

    return sanitizedProducts;
  }

  async getProductDetailsById(productId: number) {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ["vendor", "variants", "reviews", "deal"],
    });

    if (!product) {
      throw new APIError(404, `Product does not exist`);
    }

    const sanitizedProduct = {
      ...product,
      vendor: product.vendor ? sanitizeVendor(product.vendor) : null,
    };
    return sanitizedProduct;
  }

  private determineOrderStatus(stock: number) {
    if (stock <= 0) return InventoryStatus.OUT_OF_STOCK;
    if (stock < 5) return InventoryStatus.LOW_STOCK;
    return InventoryStatus.AVAILABLE;
  }

  private sanitizeDiscountType(value: unknown): DiscountType {
    const validTypes = Object.values(DiscountType);
    if (
      typeof value === "string" &&
      validTypes.includes(value as DiscountType)
    ) {
      return value as DiscountType;
    }
    return DiscountType.NONE;
  }

  private parseNumber(
    value: unknown,
    field: string,
    options: { required?: boolean; integer?: boolean; positive?: boolean } = {},
  ): number {
    if (value === undefined || value === null || value === "") {
      if (options.required) {
        throw new APIError(400, `${field} is required`);
      }
      return 0;
    }

    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      throw new APIError(400, `${field} must be a valid number`);
    }

    if (options.integer && !Number.isInteger(parsed)) {
      throw new APIError(400, `${field} must be a whole number`);
    }

    if (options.positive ? parsed <= 0 : parsed < 0) {
      throw new APIError(
        400,
        `${field} must be ${options.positive ? "greater than zero" : "non-negative"}`,
      );
    }

    return parsed;
  }

  private normalizeImageUrls(value: unknown, field: string): string[] {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) {
      throw new APIError(400, `${field} must be an array`);
    }

    return value
      .map((image, index) => {
        const url =
          typeof image === "string"
            ? image
            : image && typeof image === "object"
              ? (image as any).url || (image as any).imageUrl
              : "";

        if (typeof url !== "string" || !url.trim()) {
          throw new APIError(
            400,
            `${field}[${index}] must be a valid image URL`,
          );
        }

        return url.trim();
      })
      .filter(Boolean);
  }

  private normalizeAttributes(value: unknown): Record<string, string> {
    if (!value) return {};

    if (!Array.isArray(value) && typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).reduce(
        (acc, [key, rawValue]) => {
          if (key.trim() && rawValue !== undefined && rawValue !== null) {
            acc[key.trim().toLowerCase()] = String(rawValue).trim();
          }
          return acc;
        },
        {} as Record<string, string>,
      );
    }

    if (!Array.isArray(value)) {
      throw new APIError(400, "Variant attributes must be an object or array");
    }

    return value.reduce(
      (acc, attribute: any) => {
        const key = String(
          attribute?.type || attribute?.attributeType || attribute?.name || "",
        )
          .trim()
          .toLowerCase();

        const valueFromArray = Array.isArray(attribute?.values)
          ? attribute.values[0]?.value
          : Array.isArray(attribute?.attributeValues)
            ? attribute.attributeValues[0]
            : attribute?.value;

        if (key && valueFromArray !== undefined && valueFromArray !== null) {
          acc[key] = String(valueFromArray).trim();
        }

        return acc;
      },
      {} as Record<string, string>,
    );
  }

  private normalizeDiscount(
    basePrice: number,
    discount: unknown,
    discountType: unknown,
    fieldPrefix = "Discount",
  ): { discount: number; discountType: DiscountType } {
    const normalizedDiscount = this.parseNumber(discount ?? 0, fieldPrefix);
    const normalizedDiscountType =
      normalizedDiscount > 0
        ? this.sanitizeDiscountType(discountType ?? DiscountType.PERCENTAGE)
        : this.sanitizeDiscountType(discountType);

    if (normalizedDiscountType === DiscountType.NONE) {
      return { discount: 0, discountType: DiscountType.NONE };
    }

    if (
      normalizedDiscountType === DiscountType.PERCENTAGE &&
      normalizedDiscount > 100
    ) {
      throw new APIError(400, `${fieldPrefix} cannot exceed 100%`);
    }

    if (
      normalizedDiscountType === DiscountType.FLAT &&
      normalizedDiscount > basePrice
    ) {
      throw new APIError(400, `${fieldPrefix} cannot exceed base price`);
    }

    return {
      discount: normalizedDiscount,
      discountType: normalizedDiscountType,
    };
  }

  private normalizeVariantInput(
    variant: any,
    index: number,
    hasDeal: boolean,
    deal: Deal | null,
  ) {
    const sku = String(variant?.sku || "").trim();
    if (!sku) throw new APIError(400, `Variant ${index + 1} SKU is required`);

    const base = this.parseNumber(
      variant?.basePrice ?? variant?.price,
      `Variant ${index + 1} base price`,
      { required: true, positive: true },
    );
    const stock = this.parseNumber(
      variant?.stock,
      `Variant ${index + 1} stock`,
      {
        required: true,
        integer: true,
      },
    );

    const { discount, discountType } = hasDeal
      ? { discount: 0, discountType: DiscountType.NONE }
      : this.normalizeDiscount(
          base,
          variant?.discount,
          variant?.discountType,
          `Variant ${index + 1} discount`,
        );

    const priceAfterDiscount = this.calculateFinalPrice(
      base,
      discount,
      discountType,
    );

    return {
      id: Number.isFinite(Number(variant?.id)) ? Number(variant.id) : undefined,
      sku,
      basePrice: base,
      discount,
      discountType,
      attributes: this.normalizeAttributes(variant?.attributes),
      variantImages: this.normalizeImageUrls(
        variant?.variantImages ?? variant?.images ?? [],
        `Variant ${index + 1} images`,
      ),
      stock,
      status: this.determineOrderStatus(stock),
      finalPrice: this.applyDealPrice(priceAfterDiscount, deal),
    };
  }

  private aggregateVariantInventory(
    variants: Array<{ stock?: number | string }>,
  ): { stock: number; status: InventoryStatus } {
    const totalStock = variants.reduce(
      (total, variant) => total + Number(variant.stock || 0),
      0,
    );
    const hasLowVariant = variants.some((variant) => {
      const stock = Number(variant.stock || 0);
      return stock > 0 && stock < 5;
    });

    return {
      stock: totalStock,
      status:
        totalStock <= 0
          ? InventoryStatus.OUT_OF_STOCK
          : totalStock < 5 || hasLowVariant
            ? InventoryStatus.LOW_STOCK
            : InventoryStatus.AVAILABLE,
    };
  }

  async createProduct(
    data: Partial<ProductInterface>,
    categoryId: number,
    subcategoryId: number,
    vendorId: number,
  ): Promise<Product> {
    const {
      name,
      brand,
      description,
      keywords,
      basePrice,
      discount,
      discountType,
      stock,
      dealId,
      bannerId,
      hasVariants,
      variants,
      productImages,
    } = data;

    const isVariantProduct = hasVariants === true || hasVariants === "true";
    const normalizedProductImages = this.normalizeImageUrls(
      productImages,
      "Product images",
    );

    // ─────────────────────────────────────────────
    // Validation
    // ─────────────────────────────────────────────
    const categoryExists =
      await this.categoryService.getCategoryById(categoryId);
    if (!categoryExists) throw new APIError(404, "Category does not exist");

    const subcategoryExists = await this.subcategoryService.getSubcategoryById(
      subcategoryId,
      categoryId,
    );
    if (!subcategoryExists)
      throw new APIError(404, "Subcategory does not exist");

    if (!vendorId) throw new APIError(401, "Unauthorized: Vendor not found");

    if (!isVariantProduct) {
      if (basePrice == null || stock == null) {
        throw new APIError(
          400,
          "Base price and stock are required for non-variant products",
        );
      }
      if (normalizedProductImages.length === 0) {
        throw new APIError(400, "At least one product image is required");
      }
    } else {
      if (!variants || variants.length === 0) {
        throw new APIError(
          400,
          "Variants array is required for variant products",
        );
      }
    }

    let dealValidation: Deal | null = null;

    if (dealId) {
      dealValidation = await this.dealService.getDealById(Number(dealId));
      if (!dealValidation || dealValidation.status !== DealStatus.ENABLED) {
        throw new APIError(400, "Invalid or disabled deal");
      }
    }

    // ─────────────────────────────────────────────
    // Deal + Discount Normalization
    // ─────────────────────────────────────────────
    const hasDeal = !!dealId;
    const deal = dealValidation;

    const normalizedBasePrice = isVariantProduct
      ? null
      : this.parseNumber(basePrice, "Base price", {
          required: true,
          positive: true,
        });
    const normalizedStock = isVariantProduct
      ? null
      : this.parseNumber(stock, "Stock", {
          required: true,
          integer: true,
        });
    const normalizedProductDiscount = hasDeal
      ? { discount: 0, discountType: DiscountType.NONE }
      : this.normalizeDiscount(
          Number(normalizedBasePrice || 0),
          discount,
          discountType,
        );
    const normalizedVariants = isVariantProduct
      ? variants!.map((variant, index) =>
          this.normalizeVariantInput(variant, index, hasDeal, deal),
        )
      : [];
    const variantInventory = this.aggregateVariantInventory(normalizedVariants);

    // ─────────────────────────────────────────────
    // Product Final Price (non-variant only)
    // ─────────────────────────────────────────────
    let finalPrice: number | null = null;

    if (!isVariantProduct) {
      const priceAfterDiscount = this.calculateFinalPrice(
        Number(normalizedBasePrice),
        normalizedProductDiscount.discount,
        normalizedProductDiscount.discountType,
      );

      finalPrice = this.applyDealPrice(priceAfterDiscount, deal);
    }

    // ─────────────────────────────────────────────
    // Create Product
    // ─────────────────────────────────────────────
    const product = this.productRepository.create({
      name,
      brand,
      description,
      keywords,
      basePrice: isVariantProduct ? null : normalizedBasePrice,
      discount: normalizedProductDiscount.discount,
      discountType: normalizedProductDiscount.discountType,
      stock: isVariantProduct ? variantInventory.stock : normalizedStock,
      status: isVariantProduct
        ? variantInventory.status
        : this.determineOrderStatus(Number(normalizedStock)),
      subcategoryId,
      vendorId,
      finalPrice,
      // brandId: data.brandId ? Number(data.brandId) : null,
      dealId: dealId ? Number(dealId) : null,
      bannerId: bannerId ? Number(bannerId) : null,
      productImages: normalizedProductImages,
      hasVariants: isVariantProduct,
    });

    const savedProduct = await this.productRepository.save(product);

    // ─────────────────────────────────────────────
    // Create Variants (if any)
    // ─────────────────────────────────────────────
    let savedVariants: Variant[] = [];

    if (isVariantProduct) {
      savedVariants = await Promise.all(
        normalizedVariants.map(async (variant) => {
          const newVariant = this.variantRepository.create({
            sku: variant.sku,
            basePrice: variant.basePrice,
            discount: variant.discount,
            discountType: variant.discountType,
            attributes: variant.attributes,
            variantImages: variant.variantImages,
            stock: variant.stock,
            status: variant.status,
            productId: savedProduct.id,
            product: savedProduct,
            finalPrice: variant.finalPrice,
          });

          return this.variantRepository.save(newVariant);
        }),
      );
    }

    savedProduct.variants = savedVariants;

    return savedProduct;
  }

  public calculateFinalPrice(
    basePrice: number,
    discount = 0,
    discountType: DiscountType = DiscountType.PERCENTAGE,
  ): number {
    return calculatePriceSnapshot({
      basePrice,
      discount,
      discountType,
    }).finalPrice;
  }

  public applyDealPrice(
    priceAfterProductDiscount: number,
    deal?: Deal | null,
  ): number {
    if (!deal || !deal.discountPercentage || deal.discountPercentage <= 0) {
      return priceAfterProductDiscount;
    }

    return calculatePriceSnapshot({
      basePrice: priceAfterProductDiscount,
      discount: deal.discountPercentage,
      discountType: DiscountType.PERCENTAGE,
    }).finalPrice;
  }

  async updateProduct(
    authId: number,
    isAdmin: boolean,
    productId: number,
    data: Partial<ProductInterface>,
    categoryId: number,
    subcategoryId: number,
  ): Promise<Product> {
    const {
      name,
      brand,
      description,
      keywords,
      basePrice,
      discount,
      discountType,
      stock,
      dealId,
      bannerId,
      hasVariants,
      variants,
      // brandId,
      productImages,
    } = data;

    const whereClause = isAdmin
      ? { id: productId }
      : { id: productId, vendor: { id: authId } };

    const product = await this.productRepository.findOne({
      where: whereClause,
      relations: ["variants", "deal", "banner"],
    });

    if (!product) {
      throw new APIError(404, "Product not found or not authorized");
    }

    if (!(await this.categoryService.getCategoryById(categoryId))) {
      throw new APIError(404, "Category does not exist");
    }

    if (
      !(await this.subcategoryService.getSubcategoryById(
        subcategoryId,
        categoryId,
      ))
    ) {
      throw new APIError(404, "Subcategory does not exist");
    }

    // ---------------- DEAL RESOLUTION ----------------
    let resolvedDeal: Deal | null = null;

    if (dealId !== undefined && dealId !== null) {
      resolvedDeal = await this.dealService.getDealById(Number(dealId));
      if (!resolvedDeal || resolvedDeal.status !== DealStatus.ENABLED) {
        throw new APIError(404, "Deal does not exist or is disabled");
      }
    }

    // Apply deal to product FIRST
    if (dealId === null) {
      product.deal = null;
      product.dealId = null;
    } else if (dealId !== undefined) {
      product.deal = resolvedDeal;
      product.dealId = Number(dealId);
    }

    const hasDeal = !!product.deal;

    const hasVariantsBool =
      hasVariants === true || hasVariants === "true"
        ? true
        : hasVariants === false || hasVariants === "false"
          ? false
          : undefined;
    const originalHadVariants = product.hasVariants;
    const effectiveHasVariants = hasVariantsBool ?? product.hasVariants;

    product.name = name ?? product.name;
    product.brand = brand ?? product.brand;
    product.description = description ?? product.description;
    product.keywords = keywords ?? product.keywords;
    product.subcategoryId = subcategoryId;

    if (!effectiveHasVariants) {
      const resolvedBasePrice =
        basePrice !== undefined
          ? this.parseNumber(basePrice, "Base price", {
              required: true,
              positive: true,
            })
          : product.basePrice;
      const resolvedStock =
        stock !== undefined
          ? this.parseNumber(stock, "Stock", {
              required: true,
              integer: true,
            })
          : product.stock;

      if (resolvedBasePrice === undefined || resolvedBasePrice === null) {
        throw new APIError(400, "Base price is required");
      }
      if (resolvedStock === undefined || resolvedStock === null) {
        throw new APIError(400, "Stock is required");
      }

      const productDiscount = hasDeal
        ? { discount: 0, discountType: DiscountType.NONE }
        : this.normalizeDiscount(
            Number(resolvedBasePrice),
            discount !== undefined ? discount : product.discount,
            discountType !== undefined ? discountType : product.discountType,
          );

      product.basePrice = resolvedBasePrice;
      product.stock = resolvedStock;
      product.discount = productDiscount.discount;
      product.discountType = productDiscount.discountType;
      product.status = this.determineOrderStatus(Number(product.stock));
    } else {
      product.basePrice = null;
      product.discount = 0;
      product.discountType = DiscountType.NONE;
    }

    if (bannerId === null) {
      product.bannerId = null;
      product.banner = null;
    } else if (bannerId !== undefined) {
      product.bannerId = Number(bannerId);
    }

    // if (brandId === null) {
    //     product.brandId = null;
    // } else if (brandId !== undefined) {
    //     product.brandId = Number(brandId);
    // }

    if (productImages !== undefined) {
      const normalizedProductImages = this.normalizeImageUrls(
        productImages,
        "Product images",
      );

      if (normalizedProductImages.length === 0 && !effectiveHasVariants) {
        throw new APIError(400, "At least one product image is required");
      }
      product.productImages = normalizedProductImages;
    }

    if (!effectiveHasVariants && product.basePrice !== null) {
      const priceAfterProductDiscount = this.calculateFinalPrice(
        product.basePrice,
        product.discount ?? 0,
        product.discountType ?? DiscountType.NONE,
      );

      product.finalPrice = this.applyDealPrice(
        priceAfterProductDiscount,
        product.deal,
      );
    }

    if (!effectiveHasVariants && originalHadVariants) {
      await this.variantRepository.delete({ productId });
      product.variants = [];
    }

    if (effectiveHasVariants && variants) {
      if (!Array.isArray(variants) || variants.length === 0) {
        throw new APIError(400, "Variants are required for variant products");
      }

      const normalizedVariants = variants.map((variant, index) =>
        this.normalizeVariantInput(
          variant,
          index,
          hasDeal,
          product.deal ?? null,
        ),
      );

      const savedVariants = await Promise.all(
        normalizedVariants.map(async (variant) => {
          let existingVariant = variant.id
            ? await this.variantRepository.findOne({
                where: {
                  id: variant.id,
                  productId,
                },
              })
            : null;

          if (!existingVariant) {
            existingVariant = await this.variantRepository.findOne({
              where: {
                sku: variant.sku,
                productId,
              },
            });
          }

          if (existingVariant) {
            existingVariant.basePrice = variant.basePrice;
            existingVariant.discount = variant.discount;
            existingVariant.discountType = variant.discountType;
            existingVariant.finalPrice = variant.finalPrice;
            existingVariant.attributes = variant.attributes;
            existingVariant.variantImages = variant.variantImages;
            existingVariant.stock = variant.stock;
            existingVariant.status = variant.status;

            return this.variantRepository.save(existingVariant);
          }

          const newVariant = this.variantRepository.create({
            sku: variant.sku,
            basePrice: variant.basePrice,
            discount: variant.discount,
            discountType: variant.discountType,
            finalPrice: variant.finalPrice,
            attributes: variant.attributes,
            variantImages: variant.variantImages,
            stock: variant.stock,
            status: variant.status,
            productId,
            product,
          });

          return this.variantRepository.save(newVariant);
        }),
      );

      product.variants = savedVariants;
      product.hasVariants = true;

      const savedVariantIds = savedVariants.map((variant) => variant.id);
      if (savedVariantIds.length > 0) {
        await this.variantRepository.delete({
          productId,
          id: Not(In(savedVariantIds)),
        });
      }

      const inventory = this.aggregateVariantInventory(savedVariants);
      product.stock = inventory.stock;
      product.status = inventory.status;
    }

    if (effectiveHasVariants && !variants) {
      const existingVariants = await this.variantRepository.find({
        where: { productId },
      });
      if (existingVariants.length === 0) {
        throw new APIError(400, "Variants are required for variant products");
      }
      product.variants = existingVariants;
      const inventory = this.aggregateVariantInventory(existingVariants);
      product.stock = inventory.stock;
      product.status = inventory.status;
      product.hasVariants = true;
    }

    if (hasVariantsBool !== undefined) {
      product.hasVariants = hasVariantsBool;
    }

    return await this.productRepository.save(product);
  }

  async getAllProducts(): Promise<Product[]> {
    return await this.productRepository.find({
      relations: ["subcategory", "vendor", "deal", "variants"],
      order: {
        createdAt: "DESC",
      },
    });
  }

  async filterProducts(params: IProductQueryParams) {
    const { page, limit, search } = params;
    const skip = (page - 1) * limit;
    const {
      // brandId,
      categoryId,
      subcategoryId,
      dealId,
      sort = "all",
      bannerId,
      vendorId,
    } = params;

    const qb = this.productRepository
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.subcategory", "subcategory")
      .leftJoinAndSelect("subcategory.category", "category")
      .leftJoin("product.vendor", "vendor")
      .addSelect([
        "vendor.id",
        "vendor.businessName",
        "vendor.districtId",
        "vendor.createdAt",
        "vendor.updatedAt",
      ])
      .leftJoinAndSelect("product.deal", "deal")
      .leftJoinAndSelect("product.variants", "variants")
      .where("1 = 1");

    if (bannerId) {
      const banner = await this.bannerRepository.findOne({
        where: { id: bannerId },
      });
      if (!banner) throw new APIError(404, "Banner does not exist");
      qb.andWhere("product.bannerId = :bannerId", { bannerId });
    }
    if (subcategoryId) {
      const sub = await this.subcategoryRepository.findOne({
        where: { id: subcategoryId },
      });
      if (!sub) throw new APIError(404, "Subcategory does not exist");
      qb.andWhere("product.subcategoryId = :subcategoryId", {
        subcategoryId,
      });
    } else if (categoryId) {
      const cat = await this.categoryRepository.findOne({
        where: { id: categoryId },
      });
      if (!cat) throw new APIError(404, "Category does not exist");
      qb.andWhere("subcategory.categoryId = :categoryId", { categoryId });
    }
    // if (brandId) {
    //     const brand = await this.brandRepository.findOne({
    //         where: { id: brandId },
    //     });
    //     if (!brand) throw new APIError(404, "Brand does not exist");
    //     qb.andWhere("product.brandId = :brandId", { brandId });
    // }
    if (dealId) {
      const deal = await this.dealRepository.findOne({
        where: { id: dealId },
      });
      if (!deal) throw new APIError(404, "Deal does not exist");
      qb.andWhere("product.dealId = :dealId", { dealId });
    }
    if (vendorId) {
      const vendor = await this.vendorRepository.findOne({
        where: { id: Number(vendorId) },
      });
      if (!vendor) throw new APIError(404, "Invalid vendor id");
      qb.andWhere("product.vendorId = :vendorId", { vendorId });
    }

    if (search) {
      const searchPattern = `%${search.trim()}%`;
      qb.andWhere(
        "(product.name ILIKE :searchPattern OR product.description ILIKE :searchPattern OR product.brand ILIKE :searchPattern)",
        { searchPattern },
      );
      qb.addOrderBy(
        `CASE 
                    WHEN product.name ILIKE :searchPattern THEN 0 
                    ELSE 1 
                 END`,
        "ASC",
      );
    }

    qb.groupBy("product.id")
      .addGroupBy("subcategory.id")
      .addGroupBy("category.id")
      .addGroupBy("vendor.id")
      .addGroupBy("deal.id")
      .addGroupBy("variants.id");

    if (sort === "low-to-high") {
      qb.addSelect(
        `
      LEAST(
        "product"."basePrice" - CASE
          WHEN "product"."discountType" = 'PERCENTAGE' THEN "product"."basePrice" * "product"."discount" / 100.0
          ELSE "product"."discount"
        END,
        COALESCE(
          MIN(
            "variants"."basePrice" - CASE
              WHEN "variants"."discountType" = 'PERCENTAGE' THEN "variants"."basePrice" * "variants"."discount" / 100.0
              ELSE "variants"."discount"
            END
          ),
          "product"."basePrice" - CASE
            WHEN "product"."discountType" = 'PERCENTAGE' THEN "product"."basePrice" * "product"."discount" / 100.0
            ELSE "product"."discount"
          END
        )
      )
      `,
        "price",
      ).orderBy("price", "ASC");
    } else if (sort === "high-to-low") {
      qb.addSelect(
        `
                GREATEST(
                    "product"."basePrice" - CASE
                    WHEN "product"."discountType" = 'PERCENTAGE' THEN "product"."basePrice" * "product"."discount" / 100.0
                    ELSE "product"."discount"
                    END,
                    COALESCE(
                    MAX(
                        "variants"."basePrice" - CASE
                        WHEN "variants"."discountType" = 'PERCENTAGE' THEN "variants"."basePrice" * "variants"."discount" / 100.0
                        ELSE "variants"."discount"
                        END
                    ),
                    "product"."basePrice" - CASE
                        WHEN "product"."discountType" = 'PERCENTAGE' THEN "product"."basePrice" * "product"."discount" / 100.0
                        ELSE "product"."discount"
                    END
                    )
                )
                `,
        "price",
      ).orderBy("price", "DESC");
    } else {
      qb.orderBy("product.createdAt", "DESC");
    }

    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    return {
      data,
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit)),
    };
  }

  async getAdminProducts(params: IAdminProductQueryParams): Promise<{
    products: Product[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      // Default bumped from 7 (an arbitrary, too-small default that forced
      // heavy client-side re-slicing) to 20, matching the rest of the admin
      // dashboard. Hard-capped at 100 regardless of what the client asks for.
      sort = "createdAt",
      filter,
      vendorId,
      search,
    } = params;
    const pageNumber = Math.max(1, Number(page) || 1);
    const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
    const searchTerm = search?.trim();

    const idQuery = this.productRepository
      .createQueryBuilder("product")
      .leftJoin("product.vendor", "vendor")
      .leftJoin("product.variants", "variants")
      .leftJoin("product.deal", "deal")
      .leftJoin("product.subcategory", "subcategory")
      .leftJoin("subcategory.category", "category")
      .select("product.id", "id");

    if (filter === "out_of_stock") {
      idQuery.andWhere(
        "(product.status = :outOfStockStatus OR product.stock = 0 OR variants.stock = 0)",
        { outOfStockStatus: "OUT_OF_STOCK" },
      );
    } else if (filter === "low_stock") {
      idQuery.andWhere(
        "(product.status = :lowStockStatus OR variants.status = :lowStockStatus)",
        { lowStockStatus: "LOW_STOCK" },
      );
    } else if (filter === "available") {
      idQuery.andWhere("product.status = :availableStatus", {
        availableStatus: "AVAILABLE",
      });
    }

    if (vendorId) {
      idQuery.andWhere("product.vendorId = :vendorId", { vendorId });
    }

    if (searchTerm) {
      const wildcardSearch = `%${searchTerm}%`;
      const prefixSearch = `${searchTerm}%`;

      idQuery
        .addSelect(
          `MIN(CASE
            WHEN product.name ILIKE :prefixSearch THEN 0
            WHEN product.name ILIKE :search THEN 1
            WHEN variants.sku ILIKE :search THEN 2
            WHEN vendor.businessName ILIKE :search THEN 3
            ELSE 4
          END)`,
          "search_rank",
        )
        .andWhere(
          new Brackets((qb) => {
            qb.where("CAST(product.id AS TEXT) ILIKE :search")
              .orWhere("product.name ILIKE :search")
              .orWhere("product.brand ILIKE :search")
              .orWhere("product.description ILIKE :search")
              .orWhere("product.keywords ILIKE :search")
              .orWhere("vendor.businessName ILIKE :search")
              .orWhere("subcategory.name ILIKE :search")
              .orWhere("category.name ILIKE :search")
              .orWhere("variants.sku ILIKE :search");
          }),
        )
        .setParameters({
          search: wildcardSearch,
          prefixSearch,
        });
    }

    const totalRow = await idQuery
      .clone()
      .select("COUNT(DISTINCT product.id)", "count")
      .getRawOne<{ count: string }>();
    const total = Number(totalRow?.count || 0);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    idQuery.groupBy("product.id");

    let hasOrderBy = false;
    const applyOrderBy = (column: string, direction: "ASC" | "DESC") => {
      if (hasOrderBy) {
        idQuery.addOrderBy(column, direction);
        return;
      }
      idQuery.orderBy(column, direction);
      hasOrderBy = true;
    };

    if (searchTerm) {
      applyOrderBy("search_rank", "ASC");
    }

    switch (sort) {
      case "name":
        idQuery.addSelect("MIN(product.name)", "sort_name");
        applyOrderBy("sort_name", "ASC");
        break;
      case "oldest":
        idQuery.addSelect("MIN(product.createdAt)", "sort_created_at");
        applyOrderBy("sort_created_at", "ASC");
        break;
      case "newest":
        idQuery.addSelect("MIN(product.createdAt)", "sort_created_at");
        applyOrderBy("sort_created_at", "DESC");
        break;
      case "price_low_high":
        idQuery.addSelect("MIN(product.basePrice)", "sort_price");
        applyOrderBy("sort_price", "ASC");
        break;
      case "price_high_low":
        idQuery.addSelect("MIN(product.basePrice)", "sort_price");
        applyOrderBy("sort_price", "DESC");
        break;
      default:
        idQuery.addSelect("MIN(product.createdAt)", "sort_created_at");
        applyOrderBy("sort_created_at", "DESC");
        break;
    }
    applyOrderBy("product.id", "ASC");

    const idRows = await idQuery
      .offset((pageNumber - 1) * limit)
      .limit(limit)
      .getRawMany<{ id: number | string }>();
    const productIds = idRows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id));

    if (productIds.length === 0) {
      return {
        products: [],
        total,
        page: pageNumber,
        limit,
        totalPages,
      };
    }

    const products = await this.productRepository
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.vendor", "vendor")
      .leftJoinAndSelect("product.variants", "variants")
      .leftJoinAndSelect("product.deal", "deal")
      .leftJoinAndSelect("product.subcategory", "subcategory")
      .leftJoinAndSelect("subcategory.category", "category")
      .where("product.id IN (:...productIds)", { productIds })
      .getMany();

    const productsById = new Map(products.map((product) => [product.id, product]));
    const sortedProducts = productIds
      .map((id) => productsById.get(id))
      .filter((product): product is Product => Boolean(product));

    return {
      products: sortedProducts,
      total,
      page: pageNumber,
      limit,
      totalPages,
    };
  }

  async getProductById(
    id: number,
    subcategoryId: number,
  ): Promise<Product | null> {
    return this.productRepository
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.vendor", "vendor")
      .leftJoinAndSelect("product.subcategory", "subcategory")
      .leftJoinAndSelect("product.variants", "variant")
      .where("product.id = :id", { id })
      .andWhere("subcategory.id = :subcategoryId", { subcategoryId })
      .getOne();
  }
  async getVendorIdByProductId(productId: number): Promise<number> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      select: ["vendorId"],
    });

    if (!product) {
      throw new APIError(404, "Product not found");
    }

    return product.vendorId;
  }

  async deleteProduct(
    id: number,
    subcategoryId: number,
    userId: number,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    if (!user) {
      throw new APIError(404, "User not found");
    }

    const product = await this.productRepository.findOne({
      where: { id, subcategory: { id: subcategoryId } },
      relations: ["vendor"],
    });
    if (!product) {
      throw new APIError(404, "Product not found");
    }

    if (user.role !== UserRole.ADMIN && product.vendor.id !== userId) {
      throw new APIError(403, "You can only delete your own products");
    }

    await this.productRepository.delete(id);
  }

  async deleteProductImage(
    id: number,
    subcategoryId: number,
    userId: number,
    imageUrl: string,
  ): Promise<Product | null> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });
    const vendor = !user
      ? await this.vendorRepository.findOne({ where: { id: userId } })
      : null;

    if (!user && !vendor) {
      throw new APIError(404, "User not found");
    }

    // Fetch product with variants
    const product = await this.productRepository.findOne({
      where: { id, subcategory: { id: subcategoryId } },
      relations: ["vendor", "variants"],
    });
    if (!product) {
      throw new APIError(404, "Product not found");
    }

    const isAdmin = user?.role === UserRole.ADMIN;
    const isVendorOwner = vendor && product.vendor?.id === vendor.id;

    if (!isAdmin && !isVendorOwner) {
      throw new APIError(
        403,
        "You can only delete images from your own products",
      );
    }

    // Determine if the image belongs to the main product or a variant
    let updatedProductImages = product.productImages || [];
    let variantToUpdate: any = null;

    if (updatedProductImages.includes(imageUrl)) {
      // Image belongs to main product
      updatedProductImages = updatedProductImages.filter(
        (img) => img !== imageUrl,
      );
    } else if (product.variants && product.variants.length > 0) {
      // Check each variant
      for (const variant of product.variants) {
        if (variant.variantImages?.includes(imageUrl)) {
          variantToUpdate = variant;
          variant.variantImages = variant.variantImages.filter(
            (img) => img !== imageUrl,
          );
          break;
        }
      }
    } else {
      throw new APIError(400, "Image not found in product or variants");
    }

    // Delete image from Cloudinary
    const deletionResult =
      await this.imageDeletionService.deleteSingleImage(imageUrl);
    if (!deletionResult.success) {
      throw new APIError(
        500,
        `Failed to delete image: ${deletionResult.error || "Unknown error"}`,
      );
    }

    // Save changes
    if (variantToUpdate) {
      await this.variantRepository.save(variantToUpdate);
    } else {
      await this.productRepository.update(id, {
        productImages: updatedProductImages,
      });
    }

    return this.productRepository.findOne({
      where: { id, subcategory: { id: subcategoryId } },
      relations: ["subcategory", "vendor", "variants"],
    });
  }

  async getProductsByVendorId(vendorId: number, page: number, limit: number) {
    // Verify vendor existence via vendor service
    const vendor = await this.vendorService.findVendorById(vendorId);
    if (!vendor) {
      throw new APIError(404, "Vendor not found");
    }

    // Calculate number of records to skip based on pagination parameters
    const skip = (page - 1) * limit;

    // Find products with vendor relation filtered by vendorId, paginated with total count
    const [products, total] = await this.productRepository.findAndCount({
      where: { vendor: { id: vendorId } },
      relations: ["subcategory", "vendor", "variants", "deal"],
      skip,
      take: limit,
    });

    const sanitzedProducts = products.map((p) => {
      return {
        ...p,
        vendor: sanitizeVendor(p.vendor),
      };
    });

    console.log(sanitzedProducts);

    return { products: sanitzedProducts, total };
  }

  async deleteProductById(id: number) {
    // Fetch product with variants to collect all image URLs before deletion
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ["variants"],
    });

    if (!product) {
      throw new APIError(404, "Product does not exist");
    }

    // Collect all image URLs (product images + variant images)
    const imageUrls: string[] = [
      ...(product.productImages || []),
      ...(product.variants?.flatMap((v) => v.variantImages || []) || []),
    ];

    // Delete all images from Cloudinary (non-blocking — DB delete proceeds even if some fail)
    if (imageUrls.length > 0) {
      await Promise.allSettled(
        imageUrls.map((url) =>
          this.imageDeletionService.deleteSingleImage(url),
        ),
      );
    }

    // Delete product from database (cascades to variants)
    const result = await this.productRepository.delete({ id });

    if (result.affected === 0) {
      throw new APIError(404, "Product does not exist");
    }
  }
}
