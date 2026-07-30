import { Brackets, DataSource, Repository, In } from "typeorm";
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
import { DiscountType, ProductSortOption } from "../entities/product.enum"; // adjust path as needed
import { OrderStatus } from "../entities/order.entity";
import { sanitizeVendor } from "../utils/sanitize.util";
import { calculatePriceSnapshot, normalizeLegacyProductDiscount, normalizeLegacyVariantDiscount } from "../utils/pricing.utils";
import { OrderItem } from "../entities/orderItems.entity";
import { CartItem } from "../entities/cartItem.entity";
import { WishlistItem } from "../entities/wishlistItem.entity";
import { Review } from "../entities/reviews.entity";
import { buildCatalogTaxonomyFilter } from "../utils/catalog-query";
import { ProductSearchIndexer } from "./product-search-indexer.service";
import { buildCatalogSearchCondition } from "../search/catalog-search";
import { withAgeRestriction } from "./age-restriction.service";

interface GetProductsOptions {
  search?: string;
  sortBy?: ProductSortOption;
  status?: InventoryStatus;
}

/**
 * Identifies the caller for ownership checks. Must come from
 * `req.user`/`req.vendor` directly (never a merged bare id) — User and
 * Vendor are separate tables with independent auto-increment ids, so a
 * vendor's id can coincidentally collide with an unrelated user's id, and
 * guessing which table a bare id belongs to can silently authorize (or deny)
 * the wrong caller.
 */
interface ProductActor {
  userId?: number;
  vendorId?: number;
}

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
  private cartItemRepository: Repository<CartItem>;
  private wishlistItemRepository: Repository<WishlistItem>;
  private productSearchIndexer: ProductSearchIndexer;

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
    this.cartItemRepository = this.dataSource.getRepository(CartItem);
    this.wishlistItemRepository = this.dataSource.getRepository(WishlistItem);
    this.productSearchIndexer = new ProductSearchIndexer(this.dataSource);
    cloudinary.config({
      cloud_name: config.CLOUDINARY_CLOUD_NAME,
      api_key: config.CLOUDINARY_API_KEY,
      api_secret: config.CLOUDINARY_API_SECRET,
    });
  }

  async getAlllProducts(page: number = 1, limit: number = 50) {
    const products = await this.productRepository.find({
      relations: ["subcategory", "subcategory.category", "vendor", "deal", "reviews"],
      order: { createdAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    const sanitizedProducts = products.map((p) => ({
      ...withAgeRestriction(normalizeLegacyProductDiscount(p)),
      vendor: p.vendor ? sanitizeVendor(p.vendor) : null,
    }));

    return sanitizedProducts;
  }

  async getProductDetailsById(productId: number) {
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ["vendor", "subcategory", "subcategory.category", "variants", "reviews", "deal"],
    });

    if (!product) {
      throw new APIError(404, `Product does not exist`);
    }

    const sanitizedProduct = {
      ...withAgeRestriction(normalizeLegacyProductDiscount(product)),
      vendor: product.vendor ? sanitizeVendor(product.vendor) : null,
      variants: (product.variants ?? []).map((v) =>
        normalizeLegacyVariantDiscount(v),
      ),
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
    options: {
      required?: boolean;
      integer?: boolean;
      positive?: boolean;
    } = {},
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

  /** Every variant of a variant product must carry its own image(s) — there
   * is no product-level image to fall back to (see normalizeProductImages).
   */
  private normalizeVariantImages(value: unknown, index: number): string[] {
    const images = this.normalizeImageUrls(
      value,
      `Variant ${index + 1} images`,
    );
    if (images.length === 0) {
      throw new APIError(
        400,
        `Variant ${index + 1} must have at least one image`,
      );
    }
    return images;
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
    discountAmount: unknown,
    discountPercent: unknown,
    discountType: unknown,
    fieldPrefix = "Discount",
  ): {
    discountAmount: number;
    discountPercent: number;
    discountType: DiscountType;
    discount: number;
  } {
    const normalizedDiscountType = this.sanitizeDiscountType(discountType);

    if (normalizedDiscountType === DiscountType.NONE) {
      return {
        discountAmount: 0,
        discountPercent: 0,
        discountType: DiscountType.NONE,
        discount: 0,
      };
    }

    const parsedDiscountAmount = this.parseNumber(
      discountAmount ?? 0,
      fieldPrefix + " Amount",
    );
    const parsedDiscountPercent = this.parseNumber(
      discountPercent ?? 0,
      fieldPrefix + " Percent",
    );

    if (
      normalizedDiscountType === DiscountType.PERCENTAGE &&
      parsedDiscountPercent > 100
    ) {
      throw new APIError(400, `${fieldPrefix} percent cannot exceed 100%`);
    }

    if (
      normalizedDiscountType === DiscountType.FLAT &&
      parsedDiscountAmount > basePrice
    ) {
      throw new APIError(400, `${fieldPrefix} amount cannot exceed base price`);
    }

    let finalDiscountAmount = 0;
    let finalDiscountPercent = 0;

    if (normalizedDiscountType === DiscountType.FLAT) {
      finalDiscountAmount = parsedDiscountAmount;
      finalDiscountPercent =
        basePrice > 0
          ? Number(((parsedDiscountAmount / basePrice) * 100).toFixed(2))
          : 0;
    } else if (normalizedDiscountType === DiscountType.PERCENTAGE) {
      finalDiscountPercent = parsedDiscountPercent;
      finalDiscountAmount = Number(
        ((basePrice * parsedDiscountPercent) / 100).toFixed(2),
      );
    }

    return {
      discountAmount: finalDiscountAmount,
      discountPercent: finalDiscountPercent,
      discountType: normalizedDiscountType,
      discount:
        normalizedDiscountType === DiscountType.FLAT
          ? finalDiscountAmount
          : finalDiscountPercent,
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

    const { discountAmount, discountPercent, discountType, discount } = hasDeal
      ? {
          discountAmount: 0,
          discountPercent: 0,
          discountType: DiscountType.NONE,
          discount: 0,
        }
      : this.normalizeDiscount(
          base,
          variant?.discountAmount,
          variant?.discountPercent,
          variant?.discountType,
          `Variant ${index + 1} discount`,
        );

    const priceAfterDiscount = this.calculateFinalPrice(
      base,
      discountAmount,
      DiscountType.FLAT,
    );

    return {
      id: Number.isFinite(Number(variant?.id)) ? Number(variant.id) : undefined,
      sku,
      basePrice: base,
      discountAmount,
      discountPercent,
      discountType,
      discount,
      attributes: this.normalizeAttributes(variant?.attributes),
      variantImages: this.normalizeVariantImages(
        variant?.variantImages ?? variant?.images ?? [],
        index,
      ),
      stock,
      status: this.determineOrderStatus(stock),
      finalPrice: this.applyDealPrice(priceAfterDiscount, deal),
    };
  }

  /** Duplicate SKUs within one product break update's id-then-sku variant
   * matching (a sku lookup could resolve to the wrong row), so reject them
   * up front rather than let create/update silently corrupt a variant.
   */
  private assertUniqueSkus(variants: Array<{ sku: string }>): void {
    const seen = new Set<string>();
    for (const variant of variants) {
      const key = variant.sku.toLowerCase();
      if (seen.has(key)) {
        throw new APIError(
          400,
          `Duplicate SKU "${variant.sku}" — each variant needs a unique SKU`,
        );
      }
      seen.add(key);
    }
  }

  private aggregateVariantInventory(
    variants: Array<{ stock?: number | string }>,
  ): { stock: number; status: InventoryStatus } {
    const totalStock = variants.reduce(
      (total, variant) => total + Number(variant.stock || 0),
      0,
    );
    return {
      stock: totalStock,
      status:
        totalStock <= 0
          ? InventoryStatus.OUT_OF_STOCK
          : totalStock < 5
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
      discountAmount,
      discountPercent,
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
      // A variant product has no product-level images — each variant
      // carries its own (see normalizeVariantImages).
      if (normalizedProductImages.length > 0) {
        throw new APIError(
          400,
          "Variant products can't have product-level images — add images to each variant instead",
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

    const resolvedBannerId = bannerId
      ? (await this.bannerRepository.findOne({
          where: { id: Number(bannerId) },
        }))
        ? Number(bannerId)
        : null
      : null;

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
      ? {
          discountAmount: 0,
          discountPercent: 0,
          discountType: DiscountType.NONE,
          discount: 0,
        }
      : this.normalizeDiscount(
          Number(normalizedBasePrice || 0),
          discountAmount,
          discountPercent,
          discountType,
        );
    const normalizedVariants = isVariantProduct
      ? variants!.map((variant, index) =>
          this.normalizeVariantInput(variant, index, hasDeal, deal),
        )
      : [];
    if (isVariantProduct) this.assertUniqueSkus(normalizedVariants);
    const variantInventory = this.aggregateVariantInventory(normalizedVariants);

    // ─────────────────────────────────────────────
    // Product Final Price (non-variant only)
    // ─────────────────────────────────────────────
    let finalPrice: number | null = null;

    if (!isVariantProduct) {
      const priceAfterDiscount = this.calculateFinalPrice(
        Number(normalizedBasePrice),
        normalizedProductDiscount.discountAmount,
        DiscountType.FLAT,
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
      discountAmount: normalizedProductDiscount.discountAmount,
      discountPercent: normalizedProductDiscount.discountPercent,
      discountType: normalizedProductDiscount.discountType,
      discount: normalizedProductDiscount.discount,
      stock: isVariantProduct ? variantInventory.stock : normalizedStock,
      status: isVariantProduct
        ? variantInventory.status
        : this.determineOrderStatus(Number(normalizedStock)),
      subcategoryId,
      vendorId,
      finalPrice,
      // brandId: data.brandId ? Number(data.brandId) : null,
      dealId: dealId ? Number(dealId) : null,
      bannerId: resolvedBannerId,
      productImages: normalizedProductImages,
      hasVariants: isVariantProduct,
    });

    // ─────────────────────────────────────────────
    // Save product + variants atomically — a failed variant insert must
    // not leave a saved product with zero variants behind.
    // ─────────────────────────────────────────────
    const savedProduct = await this.dataSource.transaction(async (manager) => {
      const savedProduct = await manager.getRepository(Product).save(product);

      let savedVariants: Variant[] = [];
      if (isVariantProduct) {
        savedVariants = await Promise.all(
          normalizedVariants.map(async (variant) => {
            const insertResult = await manager
              .getRepository(Variant)
              .createQueryBuilder()
              .insert()
              .into(Variant)
              .values({
                sku: variant.sku,
                basePrice: variant.basePrice,
                discountAmount: variant.discountAmount,
                discountPercent: variant.discountPercent,
                discountType: variant.discountType,
                discount: variant.discount,
                attributes: variant.attributes,
                variantImages: variant.variantImages,
                stock: variant.stock,
                status: variant.status,
                productId: savedProduct.id,
                finalPrice: variant.finalPrice,
              })
              .returning("*")
              .execute();

            return insertResult.raw[0] as Variant;
          }),
        );
      }

      savedProduct.variants = savedVariants;
      return savedProduct;
    });

    await this.productSearchIndexer.refreshProduct(savedProduct.id);
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
      discountAmount,
      discountPercent,
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
        ? {
            discountAmount: 0,
            discountPercent: 0,
            discountType: DiscountType.NONE,
            discount: 0,
          }
        : this.normalizeDiscount(
            Number(resolvedBasePrice),
            discountAmount !== undefined
              ? discountAmount
              : product.discountAmount,
            discountPercent !== undefined
              ? discountPercent
              : product.discountPercent,
            discountType !== undefined ? discountType : product.discountType,
          );

      product.basePrice = resolvedBasePrice;
      product.stock = resolvedStock;
      product.discountAmount = productDiscount.discountAmount;
      product.discountPercent = productDiscount.discountPercent;
      product.discountType = productDiscount.discountType;
      product.discount = productDiscount.discount;
      product.status = this.determineOrderStatus(Number(product.stock));
    } else {
      product.basePrice = null;
      product.discountAmount = 0;
      product.discountPercent = 0;
      product.discountType = DiscountType.NONE;
      // Otherwise a product just switched to variants keeps whatever flat
      // price it last had as a normal product, stale forever since nothing
      // recomputes it for variant products.
      product.finalPrice = null;
    }

    if (bannerId === null) {
      product.bannerId = null;
      product.banner = null;
    } else if (bannerId !== undefined) {
      const resolvedBanner = await this.bannerRepository.findOne({
        where: { id: Number(bannerId) },
      });
      product.bannerId = resolvedBanner ? Number(bannerId) : null;
      product.banner = resolvedBanner ?? null;
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

      if (effectiveHasVariants) {
        if (normalizedProductImages.length > 0) {
          throw new APIError(
            400,
            "Variant products can't have product-level images — add images to each variant instead",
          );
        }
      } else {
        product.productImages = normalizedProductImages;
      }
    }

    // A variant product never carries product-level images (each variant
    // has its own), regardless of whether this request touched images at
    // all — otherwise switching to variants would silently keep stale
    // product-level images around.
    if (effectiveHasVariants) {
      product.productImages = null;
    } else if (!product.productImages || product.productImages.length === 0) {
      // Catches switching to "normal" without supplying images in the same
      // request too, not just an explicit empty array.
      throw new APIError(400, "At least one product image is required");
    }

    if (!effectiveHasVariants && product.basePrice !== null) {
      const priceAfterProductDiscount = this.calculateFinalPrice(
        product.basePrice,
        product.discountAmount ?? 0,
        DiscountType.FLAT,
      );

      product.finalPrice = this.applyDealPrice(
        priceAfterProductDiscount,
        product.deal,
      );
    }

    let variantsForResponse: Variant[] | undefined;

    if (!effectiveHasVariants && originalHadVariants) {
      // Switching a product to "normal" always succeeds, order history or
      // not: variants are archived (soft-deleted), never blocked. Reassigning
      // `product.variants` to [] below lets Product.variants'
      // orphanedRowAction: 'soft-delete' archive them during save(), instead
      // of hard-deleting (which order history may forbid) or nullifying
      // their NOT NULL product_id.
      const removedVariantIds = (product.variants || []).map((v) => v.id);
      if (removedVariantIds.length > 0) {
        await this.cartItemRepository.delete({
          variantId: In(removedVariantIds),
        });
        await this.wishlistItemRepository.delete({
          variantId: In(removedVariantIds),
        });
      }
      variantsForResponse = [];
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
      this.assertUniqueSkus(normalizedVariants);

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
            existingVariant.discountAmount = variant.discountAmount;
            existingVariant.discountPercent = variant.discountPercent;
            existingVariant.discountType = variant.discountType;
            existingVariant.discount = variant.discount;
            existingVariant.finalPrice = variant.finalPrice;
            existingVariant.attributes = variant.attributes;
            existingVariant.variantImages = variant.variantImages;
            existingVariant.stock = variant.stock;
            existingVariant.status = variant.status;

            return this.variantRepository.save(existingVariant);
          }

          const insertResult = await this.variantRepository
            .createQueryBuilder()
            .insert()
            .into(Variant)
            .values({
              sku: variant.sku,
              basePrice: variant.basePrice,
              discountAmount: variant.discountAmount,
              discountPercent: variant.discountPercent,
              discountType: variant.discountType,
              discount: variant.discount,
              finalPrice: variant.finalPrice,
              attributes: variant.attributes,
              variantImages: variant.variantImages,
              stock: variant.stock,
              status: variant.status,
              productId,
            })
            .returning("*")
            .execute();

          return insertResult.raw[0] as Variant;
        }),
      );

      variantsForResponse = savedVariants;
      product.hasVariants = true;

      // Any previously-active variant not present in this update's list is
      // being removed from the product: archive it (via orphanedRowAction:
      // 'soft-delete' on save, below) rather than blocking on order history.
      const keptVariantIds = new Set(
        savedVariants.map((variant) => variant.id),
      );
      const removedVariantIds = (product.variants || [])
        .map((v) => v.id)
        .filter((id) => !keptVariantIds.has(id));
      if (removedVariantIds.length > 0) {
        await this.cartItemRepository.delete({
          variantId: In(removedVariantIds),
        });
        await this.wishlistItemRepository.delete({
          variantId: In(removedVariantIds),
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
      variantsForResponse = existingVariants;
      const inventory = this.aggregateVariantInventory(existingVariants);
      product.stock = inventory.stock;
      product.status = inventory.status;
      product.hasVariants = true;
    }

    if (hasVariantsBool !== undefined) {
      product.hasVariants = hasVariantsBool;
    }

    if (variantsForResponse !== undefined) {
      product.variants = variantsForResponse;
    }

    const savedProduct = await this.productRepository.save(product);
    if (variantsForResponse !== undefined) {
      savedProduct.variants = variantsForResponse;
    }
    await this.productSearchIndexer.refreshProduct(savedProduct.id);
    return savedProduct;
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
    const {
      page,
      limit,
      search,
      categoryIds = [],
      subcategoryIds = [],
      minPrice,
      maxPrice,
      minRating,
      hasDeal,
      dealIds = [],
      bannerId,
      vendorId,
    } = params;
    const sort =
      params.sort === "low-to-high"
        ? "price_low_high"
        : params.sort === "high-to-low"
          ? "price_high_low"
          : params.sort === "all" || !params.sort
            ? "newest"
            : params.sort;
    const effectivePrice = `COALESCE(
      NULLIF("product"."finalPrice", 0),
      MIN(NULLIF("variants"."finalPrice", 0)),
      NULLIF("product"."basePrice", 0),
      MIN(NULLIF("variants"."basePrice", 0)),
      0
    )`;
    const ratingQuery = this.dataSource
      .getRepository(Review)
      .createQueryBuilder("review")
      .select("review.productId", "product_id")
      .addSelect("AVG(review.rating)", "avg_rating")
      .addSelect("COUNT(*)", "review_count")
      .groupBy("review.productId");
    const salesQuery = this.dataSource
      .getRepository(OrderItem)
      .createQueryBuilder("order_item")
      .select("order_item.productId", "product_id")
      .addSelect("SUM(order_item.quantity)", "sold_quantity")
      .groupBy("order_item.productId");
    const ratingAverage = `COALESCE("rating"."avg_rating", 0)`;
    const reviewCount = `COALESCE("rating"."review_count", 0)`;
    const soldQuantity = `COALESCE("sales"."sold_quantity", 0)`;
    const discountPercent = `GREATEST(
      COALESCE("product"."discountPercent", 0),
      COALESCE(MAX("variants"."discountPercent"), 0),
      COALESCE("deal"."discountPercentage", 0)
    )`;
    const taxonomyFilter = buildCatalogTaxonomyFilter(categoryIds, subcategoryIds);
    const searchCondition = search
      ? buildCatalogSearchCondition(search)
      : undefined;

    const query = this.productRepository
      .createQueryBuilder("product")
      .leftJoin("product.subcategory", "subcategory")
      .leftJoin("subcategory.category", "category")
      .leftJoin("product.deal", "deal")
      .leftJoin("product.variants", "variants", "variants.deletedAt IS NULL")
      .leftJoin(`(${ratingQuery.getQuery()})`, "rating", "rating.product_id = product.id")
      .leftJoin(`(${salesQuery.getQuery()})`, "sales", "sales.product_id = product.id")
      .where("product.deletedAt IS NULL")
      .select("product.id", "id")
      .addSelect(effectivePrice, "effective_price")
      .addSelect(ratingAverage, "avg_rating")
      .addSelect(reviewCount, "review_count")
      .addSelect(soldQuantity, "sold_quantity")
      .addSelect(discountPercent, "discount_percent")
      .groupBy("product.id")
      .addGroupBy("deal.id")
      .addGroupBy("rating.product_id")
      .addGroupBy("rating.avg_rating")
      .addGroupBy("rating.review_count")
      .addGroupBy("sales.product_id")
      .addGroupBy("sales.sold_quantity");

    if (taxonomyFilter) query.andWhere(taxonomyFilter.condition, taxonomyFilter.parameters);
    if (bannerId !== undefined) query.andWhere("product.bannerId = :bannerId", { bannerId });
    if (dealIds.length) {
      query.andWhere("product.dealId IN (:...dealIds)", { dealIds });
      query.andWhere("deal.status = :selectedDealStatus", { selectedDealStatus: DealStatus.ENABLED });
    }
    if (hasDeal === true) {
      query.andWhere("deal.status = :enabledDealStatus", { enabledDealStatus: DealStatus.ENABLED });
    }
    if (hasDeal === false) {
      query.andWhere("(deal.id IS NULL OR deal.status != :enabledDealStatus)", {
        enabledDealStatus: DealStatus.ENABLED,
      });
    }
    if (vendorId) query.andWhere("product.vendorId = :vendorId", { vendorId });

    if (searchCondition) {
      query.andWhere(searchCondition.where, searchCondition.parameters);
      query.addSelect(`MIN(${searchCondition.score})`, "search_relevance");
    }
    if (minPrice !== undefined) query.having(`${effectivePrice} >= :minPrice`, { minPrice });
    if (maxPrice !== undefined) query.andHaving(`${effectivePrice} <= :maxPrice`, { maxPrice });
    if (minRating !== undefined) query.andHaving(`${ratingAverage} >= :minRating`, { minRating });

    switch (sort) {
      case "relevance":
        if (searchCondition) query.addOrderBy("search_relevance", "DESC");
        break;
      case "price_low_high":
        query.addOrderBy("effective_price", "ASC");
        break;
      case "price_high_low":
        query.addOrderBy("effective_price", "DESC");
        break;
      case "discount_high_low":
        query.addOrderBy("discount_percent", "DESC");
        break;
      case "best_selling":
        query.addOrderBy("sold_quantity", "DESC");
        break;
      case "rating":
        query.addOrderBy("avg_rating", "DESC");
        query.addOrderBy("review_count", "DESC");
        break;
      default:
        query.addOrderBy("product.createdAt", "DESC");
        break;
    }
    query.addOrderBy("product.id", "DESC");

    let total: number;
    if (minPrice === undefined && maxPrice === undefined && minRating === undefined) {
      const countQuery = this.productRepository
        .createQueryBuilder("product")
        .leftJoin("product.subcategory", "subcategory")
        .leftJoin("subcategory.category", "category")
        .leftJoin("product.deal", "deal")
        .leftJoin("product.variants", "variants", "variants.deletedAt IS NULL")
        .where("product.deletedAt IS NULL");
      if (taxonomyFilter) countQuery.andWhere(taxonomyFilter.condition, taxonomyFilter.parameters);
      if (bannerId !== undefined) countQuery.andWhere("product.bannerId = :bannerId", { bannerId });
      if (dealIds.length) {
        countQuery.andWhere("product.dealId IN (:...dealIds)", { dealIds });
        countQuery.andWhere("deal.status = :selectedDealStatus", { selectedDealStatus: DealStatus.ENABLED });
      }
      if (hasDeal === true) countQuery.andWhere("deal.status = :enabledDealStatus", { enabledDealStatus: DealStatus.ENABLED });
      if (hasDeal === false) countQuery.andWhere("(deal.id IS NULL OR deal.status != :enabledDealStatus)", { enabledDealStatus: DealStatus.ENABLED });
      if (vendorId) countQuery.andWhere("product.vendorId = :vendorId", { vendorId });
      if (searchCondition) {
        countQuery.andWhere(searchCondition.where, searchCondition.parameters);
      }
      const countRow = await countQuery.select("COUNT(DISTINCT product.id)", "total").getRawOne<{ total: string }>();
      total = Number(countRow?.total ?? 0);
    } else {
      total = (await query.clone().getRawMany()).length;
    }
    const simplePage = sort === "newest" && minPrice === undefined && maxPrice === undefined && minRating === undefined;
    let metricRows: Array<{
      id: string;
      effective_price: string;
      avg_rating: string;
      review_count: string;
      sold_quantity: string;
    }>;
    if (simplePage) {
      const pageQuery = this.productRepository
        .createQueryBuilder("product")
        .leftJoin("product.subcategory", "subcategory")
        .leftJoin("subcategory.category", "category")
        .leftJoin("product.deal", "deal")
        .leftJoin("product.variants", "variants", "variants.deletedAt IS NULL")
        .where("product.deletedAt IS NULL")
        .select("product.id", "id")
        .addSelect("product.createdAt", "created_at")
        .distinct(true)
        .orderBy("product.createdAt", "DESC")
        .addOrderBy("product.id", "DESC");
      if (taxonomyFilter) pageQuery.andWhere(taxonomyFilter.condition, taxonomyFilter.parameters);
      if (bannerId !== undefined) pageQuery.andWhere("product.bannerId = :bannerId", { bannerId });
      if (dealIds.length) {
        pageQuery.andWhere("product.dealId IN (:...dealIds)", { dealIds });
        pageQuery.andWhere("deal.status = :selectedDealStatus", { selectedDealStatus: DealStatus.ENABLED });
      }
      if (hasDeal === true) pageQuery.andWhere("deal.status = :enabledDealStatus", { enabledDealStatus: DealStatus.ENABLED });
      if (hasDeal === false) pageQuery.andWhere("(deal.id IS NULL OR deal.status != :enabledDealStatus)", { enabledDealStatus: DealStatus.ENABLED });
      if (vendorId) pageQuery.andWhere("product.vendorId = :vendorId", { vendorId });
      if (searchCondition) {
        pageQuery.andWhere(searchCondition.where, searchCondition.parameters);
      }
      const ids = await pageQuery.offset((page - 1) * limit).limit(limit).getRawMany<{ id: string }>();
      metricRows = ids.map((row) => ({ id: row.id, effective_price: "0", avg_rating: "0", review_count: "0", sold_quantity: "0" }));
    } else {
      metricRows = await query.clone().offset((page - 1) * limit).limit(limit).getRawMany();
    }
    const productIds = metricRows.map((row) => Number(row.id));
    if (!productIds.length) {
      return { data: [], total, page, limit, totalPages: Math.ceil(total / limit) };
    }

    const products = await this.productRepository
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.subcategory", "subcategory")
      .leftJoinAndSelect("subcategory.category", "category")
      .leftJoin("product.vendor", "vendor")
      .addSelect(["vendor.id", "vendor.businessName", "vendor.districtId", "vendor.createdAt", "vendor.updatedAt"])
      .leftJoinAndSelect("product.deal", "deal")
      .leftJoinAndSelect("product.variants", "variants", "variants.deletedAt IS NULL")
      .where("product.id IN (:...productIds)", { productIds })
      .andWhere("product.deletedAt IS NULL")
      .getMany();
    const productsById = new Map(products.map((product) => [product.id, product]));
    const metricsById = new Map(metricRows.map((row) => [Number(row.id), row]));
    if (simplePage) {
      const ratingRows = await this.dataSource.getRepository(Review).createQueryBuilder("review")
        .select("review.productId", "product_id").addSelect("AVG(review.rating)", "avg_rating")
        .addSelect("COUNT(*)", "review_count").where("review.productId IN (:...productIds)", { productIds }).groupBy("review.productId").getRawMany();
      const salesRows = await this.dataSource.getRepository(OrderItem).createQueryBuilder("order_item")
        .select("order_item.productId", "product_id").addSelect("SUM(order_item.quantity)", "sold_quantity")
        .where("order_item.productId IN (:...productIds)", { productIds }).groupBy("order_item.productId").getRawMany();
      const ratingsById = new Map(ratingRows.map((row) => [Number(row.product_id), row]));
      const salesById = new Map(salesRows.map((row) => [Number(row.product_id), row]));
      for (const productId of productIds) {
        const product = productsById.get(productId)!;
        const variantPrices = (product.variants ?? [])
          .map((variant) => Number(variant.finalPrice ?? variant.basePrice ?? 0))
          .filter((price) => price > 0);
        const productFinalPrice = Number(product.finalPrice ?? 0);
        const productBasePrice = Number(product.basePrice ?? 0);
        const effectivePrice = productFinalPrice > 0
          ? productFinalPrice
          : variantPrices.length > 0
            ? Math.min(...variantPrices)
            : productBasePrice;
        metricsById.set(productId, {
          id: String(productId), effective_price: String(effectivePrice),
          avg_rating: String(ratingsById.get(productId)?.avg_rating ?? 0),
          review_count: String(ratingsById.get(productId)?.review_count ?? 0),
          sold_quantity: String(salesById.get(productId)?.sold_quantity ?? 0),
        });
      }
    }
    const data = productIds
      .map((id) => productsById.get(id))
      .filter((product): product is Product => Boolean(product))
      .map((product) => {
        const metric = metricsById.get(product.id)!;
        return {
          ...normalizeLegacyProductDiscount(product),
          variants: (product.variants ?? []).map(normalizeLegacyVariantDiscount),
          effectivePrice: Number(metric.effective_price),
          avgRating: Number(metric.avg_rating),
          count: Number(metric.review_count),
          reviewCount: Number(metric.review_count),
          soldQuantity: Number(metric.sold_quantity),
        };
      });

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** @deprecated Kept temporarily while the public catalog query is migrated below. */
  private async filterProductsLegacy(params: IProductQueryParams) {
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
      .leftJoinAndSelect(
        "product.variants",
        "variants",
        "variants.deletedAt IS NULL",
      )
      .where("1 = 1")
      .andWhere("product.deletedAt IS NULL");

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

    if (search?.trim()) {
      const term = search.trim();
      const searchPattern = `%${term}%`;

      // Same field set the admin product search already covers
      // (getAdminProducts below) — customers searching by SKU or
      // category/subcategory name were getting zero results here even
      // though the exact same search on the admin panel found the
      // product, since this list was missing those two conditions.
      const conditions = [
        "product.name ILIKE :searchPattern",
        "product.brand ILIKE :searchPattern",
        "product.keywords ILIKE :searchPattern",
        "variants.sku ILIKE :searchPattern",
        "subcategory.name ILIKE :searchPattern",
        "category.name ILIKE :searchPattern",
      ];

      // only search description if the search term is at least 4 characters
      if (term.length >= 4) {
        conditions.push("product.description ILIKE :searchPattern");
      }

      qb.andWhere(`(${conditions.join(" OR ")})`, {
        searchPattern,
      });

      qb.addSelect(
        `
          CASE
            WHEN "product"."name" ILIKE :searchPattern THEN 0
            WHEN "product"."keywords" ILIKE :searchPattern THEN 1
            WHEN "product"."brand" ILIKE :searchPattern THEN 2
            WHEN "variants"."sku" ILIKE :searchPattern THEN 3
            WHEN "subcategory"."name" ILIKE :searchPattern THEN 4
            WHEN "category"."name" ILIKE :searchPattern THEN 4
            ${
              term.length >= 4
                ? 'WHEN "product"."description" ILIKE :searchPattern THEN 5'
                : ""
            }
            ELSE 6
          END
        `,
        "search_relevance",
      ).addOrderBy("search_relevance", "ASC");
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
      ).addOrderBy("price", "ASC");
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
      ).addOrderBy("price", "DESC");
    } else {
      qb.addOrderBy("product.createdAt", "DESC");
    }

    qb.skip(skip).take(limit);

    const [data, total] = await qb.getManyAndCount();

    const normalizedData = data.map((p) => ({
      ...normalizeLegacyProductDiscount(p),
      variants: (p.variants ?? []).map((v) =>
        normalizeLegacyVariantDiscount(v),
      ),
    }));

    return {
      data: normalizedData,
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
      .leftJoin("product.variants", "variants", "variants.deletedAt IS NULL")
      .leftJoin("product.deal", "deal")
      .leftJoin("product.subcategory", "subcategory")
      .leftJoin("subcategory.category", "category")
      .where("product.deletedAt IS NULL")
      .select("product.id", "id");

    if (filter === "out_of_stock") {
      idQuery.andWhere("product.status = :outOfStockStatus", {
        outOfStockStatus: "OUT_OF_STOCK",
      });
    } else if (filter === "low_stock") {
      idQuery.andWhere("product.status = :lowStockStatus", {
        lowStockStatus: "LOW_STOCK",
      });
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
        // `MIN(product.basePrice)` alone always sorted variant
        // products as NULL (basePrice is only set on non-variant
        // products — variants carry their own basePrice/discount),
        // so every variant product tied for last place regardless of
        // its actual price. Mirror filterProducts' LEAST/GREATEST
        // formula: fall back to each variant's own discounted price
        // when the product itself has none.
        idQuery.addSelect(
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
          "sort_price",
        );
        applyOrderBy("sort_price", "ASC");
        break;
      case "price_high_low":
        idQuery.addSelect(
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
          "sort_price",
        );
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
      .leftJoinAndSelect(
        "product.variants",
        "variants",
        "variants.deletedAt IS NULL",
      )
      .leftJoinAndSelect("product.deal", "deal")
      .leftJoinAndSelect("product.subcategory", "subcategory")
      .leftJoinAndSelect("subcategory.category", "category")
      .where("product.id IN (:...productIds)", { productIds })
      .andWhere("product.deletedAt IS NULL")
      .getMany();

    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const sortedProducts = productIds
      .map((id) => productsById.get(id))
      .filter((product): product is Product => Boolean(product))
      .map((p) => ({
        ...normalizeLegacyProductDiscount(p),
        variants: (p.variants ?? []).map((v) =>
          normalizeLegacyVariantDiscount(v),
        ),
      }));

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
    const product = await this.productRepository
      .createQueryBuilder("product")
      .leftJoinAndSelect("product.vendor", "vendor")
      .leftJoinAndSelect("product.subcategory", "subcategory")
      .leftJoinAndSelect(
        "product.variants",
        "variant",
        "variant.deletedAt IS NULL",
      )
      .where("product.id = :id", { id })
      .andWhere("subcategory.id = :subcategoryId", { subcategoryId })
      .andWhere("product.deletedAt IS NULL")
      .getOne();

    if (!product) return null;

    // Normalize legacy discount fields in-place for all callers
    const normalized = withAgeRestriction(normalizeLegacyProductDiscount(product));
    normalized.variants = (product.variants ?? []).map((v) =>
      normalizeLegacyVariantDiscount(v),
    );
    return normalized;
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

  // Cart/wishlist rows relied on the product/variant FK's onDelete: 'CASCADE'
  // to disappear when the product was hard-deleted. Archiving no longer
  // triggers that DB-level cascade, so it must be done explicitly here —
  // otherwise a cart/wishlist would keep a "ghost" entry pointing at a
  // product that no longer resolves through any active-only read.
  private async removeFromCartsAndWishlists(productId: number): Promise<void> {
    // CartItem has no scalar productId column (only the `product` relation),
    // so the delete criteria must go through the relation, not a flat field.
    await this.cartItemRepository.delete({ product: { id: productId } });
    await this.wishlistItemRepository.delete({ productId });
  }

  /**
   * Throws unless `actor` is an admin or the given product's owning vendor.
   * `product.vendor` must be loaded by the caller.
   */
  private async assertProductOwner(
    product: Product,
    actor: ProductActor,
    action: string,
  ): Promise<void> {
    if (actor.userId === undefined && actor.vendorId === undefined) {
      throw new APIError(404, "User not found");
    }

    let isAdmin = false;
    if (actor.userId !== undefined) {
      const user = await this.userRepository.findOne({
        where: { id: actor.userId },
      });
      if (!user) {
        throw new APIError(404, "User not found");
      }
      isAdmin = user.role === UserRole.ADMIN;
    }

    const isVendorOwner =
      actor.vendorId !== undefined && product.vendor?.id === actor.vendorId;

    if (!isAdmin && !isVendorOwner) {
      throw new APIError(403, `You can only ${action} your own products`);
    }
  }

  async deleteProductImage(
    id: number,
    subcategoryId: number,
    actor: ProductActor,
    imageUrl: string,
  ): Promise<Product | null> {
    // Fetch product with variants
    const product = await this.productRepository.findOne({
      where: { id, subcategory: { id: subcategoryId } },
      relations: ["vendor", "variants"],
    });
    if (!product) {
      throw new APIError(404, "Product not found");
    }

    await this.assertProductOwner(product, actor, "delete images from");

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

  async getProductsByVendorId(
    vendorId: number,
    page: number,
    limit: number,
    options: GetProductsOptions = {},
  ) {
    const vendor = await this.vendorService.findVendorById(vendorId);
    if (!vendor) {
      throw new APIError(404, "Vendor not found");
    }

    const { search, sortBy, status } = options;
    const skip = (page - 1) * limit;

    const idQb = this.productRepository
      .createQueryBuilder("product")
      .select("product.id", "id")
      .where("product.vendorId = :vendorId", { vendorId })
      .andWhere("product.deletedAt IS NULL");

    if (search) {
      idQb.andWhere("product.name ILIKE :search", {
        search: `%${search}%`,
      });
    }

    if (status) {
      if (status === InventoryStatus.AVAILABLE) {
        idQb.andWhere(
          `(
                    (product."hasVariants" = false AND product.status = :status)
                    OR
                    (product."hasVariants" = true AND 
                        (SELECT COALESCE(SUM(v.stock), 0) FROM variants v WHERE v.product_id = product.id AND v.deleted_at IS NULL) >= 5
                    )
                )`,
          { status },
        );
      } else if (status === InventoryStatus.LOW_STOCK) {
        idQb.andWhere(
          `(
                    (product."hasVariants" = false AND product.status = :status)
                    OR
                    (product."hasVariants" = true AND 
                        (SELECT COALESCE(SUM(v.stock), 0) FROM variants v WHERE v.product_id = product.id AND v.deleted_at IS NULL) > 0 AND
                        (SELECT COALESCE(SUM(v.stock), 0) FROM variants v WHERE v.product_id = product.id AND v.deleted_at IS NULL) < 5
                    )
                )`,
          { status },
        );
      } else if (status === InventoryStatus.OUT_OF_STOCK) {
        idQb.andWhere(
          `(
                    (product."hasVariants" = false AND product.status = :status)
                    OR
                    (product."hasVariants" = true AND 
                        (SELECT COALESCE(SUM(v.stock), 0) FROM variants v WHERE v.product_id = product.id AND v.deleted_at IS NULL) <= 0
                    )
                )`,
          { status },
        );
      }
    }

    const total = await idQb.getCount();

    idQb.addSelect(
      `CASE WHEN product."hasVariants" = true
            THEN (
                SELECT MIN(COALESCE(v."finalPrice", v."basePrice"))
                FROM variants v
                WHERE v.product_id = product.id AND v.deleted_at IS NULL
            )
            ELSE COALESCE(product."finalPrice", product."basePrice")
        END`,
      "effectiveprice",
    );

    idQb.addSelect(
      `CASE WHEN product."hasVariants" = true
            THEN (
                SELECT COALESCE(SUM(v.stock), 0)
                FROM variants v
                WHERE v.product_id = product.id AND v.deleted_at IS NULL
            )
            ELSE COALESCE(product.stock, 0)
        END`,
      "effectivestock",
    );

    switch (sortBy) {
      case ProductSortOption.PRICE_HIGH_LOW:
        idQb.orderBy("effectiveprice", "DESC", "NULLS LAST");
        break;
      case ProductSortOption.PRICE_LOW_HIGH:
        idQb.orderBy("effectiveprice", "ASC", "NULLS LAST");
        break;
      case ProductSortOption.STOCK_HIGH_LOW:
        idQb.orderBy("effectivestock", "DESC");
        break;
      case ProductSortOption.STOCK_LOW_HIGH:
        idQb.orderBy("effectivestock", "ASC");
        break;
      case ProductSortOption.NAME_A_Z:
        idQb.orderBy("product.name", "ASC");
        break;
      case ProductSortOption.NAME_Z_A:
        idQb.orderBy("product.name", "DESC");
        break;
      case ProductSortOption.OLDEST:
        idQb.orderBy("product.createdAt", "ASC");
        break;
      case ProductSortOption.NEWEST:
      default:
        idQb.orderBy("product.createdAt", "DESC");
    }

    idQb.offset(skip).limit(limit);

    const rows = await idQb.getRawMany();
    const orderedIds: number[] = rows.map((r) => r.id);

    if (orderedIds.length === 0) {
      return { products: [], total };
    }

    const products = await this.productRepository.find({
      where: { id: In(orderedIds) },
      relations: ["subcategory", "subcategory.category", "vendor", "variants", "deal"],
    });

    const productMap = new Map(products.map((p) => [p.id, p]));
    const orderedProducts = orderedIds
      .map((id) => productMap.get(id))
      .filter((p): p is Product => Boolean(p));

    const sanitizedProducts = orderedProducts.map((p) => ({
      ...withAgeRestriction(normalizeLegacyProductDiscount(p)),
      vendor: sanitizeVendor(p.vendor),
      variants: (p.variants ?? []).map((v) =>
        normalizeLegacyVariantDiscount(v),
      ),
    }));

    return { products: sanitizedProducts, total };
  }

  async deleteProductById(id: number, actor: ProductActor) {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ["vendor", "variants"],
    });

    if (!product) {
      throw new APIError(404, "Product does not exist");
    }

    await this.assertProductOwner(product, actor, "delete");

    // Archive (soft-delete) rather than hard-delete: order history must
    // never be broken, and OrderItem.product cascades on a real DELETE.
    // Images are left in place (not removed from Cloudinary) since the
    // product row — and its productImages URLs — still exists, just archived.
    //
    // Uses the bulk .softDelete() query (SQL CURRENT_TIMESTAMP) instead of
    // cascading .softRemove(entity) (which stamps deletedAt with a fresh JS
    // `new Date()` per entity — parent and children end up with slightly
    // different instants). Doing both in one transaction with .softDelete()
    // gives the product and its variants the exact same deletedAt, which
    // restoreProduct relies on to identify "archived by this same delete".
    const variantIds = product.variants.map((v) => v.id);
    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(Product).softDelete(id);
      if (variantIds.length > 0) {
        await manager.getRepository(Variant).softDelete(variantIds);
      }
    });
    await this.removeFromCartsAndWishlists(id);
  }

  private async resolveDeletedProductForOwner(
    id: number,
    actor: ProductActor,
  ): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id },
      relations: ["vendor"],
      withDeleted: true,
    });

    if (!product || !product.deletedAt) {
      throw new APIError(404, "Archived product not found");
    }

    await this.assertProductOwner(product, actor, "restore");

    return product;
  }

  /**
   * Restores an archived product. Also restores exactly the variants that
   * were archived by that same delete (same Postgres transaction => same
   * CURRENT_TIMESTAMP, so an exact deletedAt match reliably identifies them)
   * — variants a vendor removed individually beforehand, in a separate edit,
   * are left archived rather than being resurrected.
   */
  async restoreProduct(id: number, actor: ProductActor): Promise<Product> {
    const product = await this.resolveDeletedProductForOwner(id, actor);

    // Compared entirely in SQL against the still-archived product row —
    // round-tripping `product.deletedAt` through a JS Date and back loses
    // the sub-millisecond precision Postgres actually stored, so an
    // in-JS comparison silently never matches. Must run before recover()
    // clears the product's own deleted_at, which is what's being matched.
    const siblingVariants = await this.variantRepository
      .createQueryBuilder("variant")
      .withDeleted()
      .where("variant.productId = :id", { id })
      .andWhere(
        "variant.deletedAt = (SELECT p.deleted_at FROM products p WHERE p.id = :id)",
        { id },
      )
      .getMany();

    await this.productRepository.recover(product);

    if (siblingVariants.length > 0) {
      await this.variantRepository.recover(siblingVariants);
    }

    const restored = await this.productRepository.findOne({
      where: { id },
      relations: ["variants", "vendor", "subcategory", "deal"],
    });
    await this.productSearchIndexer.refreshProduct(id);
    return restored!;
  }

  /** Restores a single archived variant without touching its product. */
  async restoreVariant(
    productId: number,
    variantId: number,
    actor: ProductActor,
  ): Promise<Variant> {
    // Deliberately NOT loading the `variants` relation here (unlike other
    // reads in this class): with withDeleted:true it would attach a stale
    // in-memory list (including still-archived siblings) to the entity, and
    // the later productRepository.save() below would cascade-diff that
    // stale list against the DB's current active children — the same
    // orphan-cascade hazard resolveDeletedProductForOwner avoids for the
    // same reason.
    const product = await this.productRepository.findOne({
      where: { id: productId },
      relations: ["vendor"],
      withDeleted: true,
    });
    if (!product) {
      throw new APIError(404, "Product not found");
    }

    await this.assertProductOwner(product, actor, "restore variants of");

    if (product.deletedAt) {
      throw new APIError(
        400,
        "This product itself is archived — restore the product first, then its variants",
      );
    }

    const variant = await this.variantRepository.findOne({
      where: { id: variantId, productId },
      withDeleted: true,
    });
    if (!variant || !variant.deletedAt) {
      throw new APIError(404, "Archived variant not found");
    }

    await this.variantRepository.recover(variant);

    // A restored variant is invisible otherwise: every read (and the edit
    // form) gates the variants array on hasVariants, and stock/status are
    // only ever recomputed inside updateProduct — never here. Bring the
    // product into a consistent variant-mode state so the restored variant
    // actually shows up, instead of sitting active-but-orphaned in the DB.
    const activeVariants = await this.variantRepository.find({
      where: { productId },
    });
    const inventory = this.aggregateVariantInventory(activeVariants);
    product.hasVariants = true;
    product.basePrice = null;
    product.discount = 0;
    product.discountType = DiscountType.NONE;
    product.productImages = null;
    product.stock = inventory.stock;
    product.status = inventory.status;
    await this.productRepository.save(product);
    await this.productSearchIndexer.refreshProduct(productId);

    return variant;
  }

  /**
   * Lists archived (soft-deleted) products so a vendor/admin has somewhere
   * to find and restore them — every other product read excludes them by
   * design. Vendors only see their own; admins (actor.vendorId undefined)
   * see all.
   */
  /**
   * Lists everything a vendor/admin needs to find and restore: products
   * that are themselves archived, AND products that are still active but
   * have one or more individually-archived variants (e.g. removed during a
   * normal hasVariants-off edit). One unified list — a row is either
   * "product archived" or "N variant(s) archived", never both concerns
   * split across separate endpoints.
   */
  async getArchivedProducts(
    actor: ProductActor,
    page: number,
    limit: number,
    search?: string,
    type?: "product" | "variants",
  ): Promise<{
    products: Array<
      Product & { isProductArchived: boolean; archivedVariantsCount: number }
    >;
    total: number;
    page: number;
    limit: number;
  }> {
    const skip = (page - 1) * limit;

    const idQb = this.productRepository
      .createQueryBuilder("product")
      .withDeleted()
      .select("product.id", "id")
      .where(
        type === "product"
          ? "product.deletedAt IS NOT NULL"
          : type === "variants"
            ? `product.deletedAt IS NULL AND EXISTS (
                SELECT 1 FROM variants v
                WHERE v.product_id = product.id AND v.deleted_at IS NOT NULL
              )`
            : `(product.deletedAt IS NOT NULL OR EXISTS (
                SELECT 1 FROM variants v
                WHERE v.product_id = product.id AND v.deleted_at IS NOT NULL
              ))`,
      );

    if (actor.vendorId !== undefined) {
      idQb.andWhere("product.vendorId = :vendorId", {
        vendorId: actor.vendorId,
      });
    }
    if (search) {
      idQb.andWhere("product.name ILIKE :search", { search: `%${search}%` });
    }

    const total = await idQb.getCount();

    const rows = await idQb
      .orderBy(
        `COALESCE(product.deletedAt, (
          SELECT MAX(v.deleted_at) FROM variants v
          WHERE v.product_id = product.id AND v.deleted_at IS NOT NULL
        ))`,
        "DESC",
      )
      .offset(skip)
      .limit(limit)
      .getRawMany();
    const ids = rows.map((r) => Number(r.id));

    if (ids.length === 0) {
      return { products: [], total, page, limit };
    }

    // withDeleted here is deliberate and safe (unlike restoreVariant above):
    // this is a read-only display list, nothing gets saved back, so there's
    // no orphan-cascade risk in attaching every variant regardless of status.
    const products = await this.productRepository.find({
      where: { id: In(ids) },
      relations: ["vendor", "subcategory", "variants"],
      withDeleted: true,
    });
    const productsById = new Map(products.map((p) => [p.id, p]));

    const ordered = ids
      .map((id) => productsById.get(id))
      .filter((p): p is Product => Boolean(p))
      .map((p) => {
        const archivedVariants = (p.variants || []).filter((v) => v.deletedAt);
        const activeVariants = (p.variants || []).filter((v) => !v.deletedAt);
        return {
          ...p,
          variants: activeVariants,
          archivedVariants,
          isProductArchived: Boolean(p.deletedAt),
          archivedVariantsCount: archivedVariants.length,
          // Product-level image first; else fall back to any variant's
          // image (active or archived) so a variant product's archived
          // row isn't left with a blank thumbnail.
          thumbnail:
            p.productImages?.[0] ??
            activeVariants[0]?.variantImages?.[0] ??
            archivedVariants[0]?.variantImages?.[0] ??
            null,
        };
      });

    return { products: ordered as any, total, page, limit };
  }
}
