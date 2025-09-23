import { DataSource, Repository } from 'typeorm';
import { Product } from '../entities/product.entity';
import { Subcategory } from '../entities/subcategory.entity';
import { User, UserRole } from '../entities/user.entity';
import { v2 as cloudinary } from 'cloudinary';
import { APIError } from '../utils/ApiError.utils';
import { Vendor } from '../entities/vendor.entity';
import { VendorService } from './vendor.service';
import { IProductQueryParams, IAdminProductQueryParams } from '../interface/product.interface';
import { Deal, DealStatus } from '../entities/deal.entity';
import { ImageUploadService } from './image.upload.service';
import { ImageDeletionService } from './image.delete.service';
import { Category } from '../entities/category.entity';
import { Brand } from '../entities/brand.entity';
import { Banner } from '../entities/banner.entity';
import { InventoryStatus, ProductInterface, DiscountType } from '../utils/zod_validations/product.zod';
import { CategoryService } from './category.service';
import { BannerService } from './banner.service';
import { DealService } from './deal.service';
import { SubcategoryService } from './subcategory.service';
import { MulterFile } from '../config/multer.config';
import { Variant } from '../entities/variant.entity';
import config from '../config/env.config';

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
        this.variantRepository = this.dataSource.getRepository(Variant)

        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });
    }

    async getAlllProducts(): Promise<Product[]> {
        return this.productRepository.find({
            relations: ['subcategory', 'vendor', 'brand', 'deal', 'reviews'],
            order: {
                created_at: 'DESC',
            },
        });
    }

    async getProductDetailsById(productId: number): Promise<Product> {
        const product = await this.productRepository.findOne({
            where: { id: productId },
            relations: ['vendor', 'variants', 'reviews'], // Include variants relation
        });

        if (!product) {
            throw new APIError(404, `Product does not exist`);
        }

        return product;
    }

    private determineOrderStatus(stock: number) {
        if (stock <= 0) return InventoryStatus.OUT_OF_STOCK;
        if (stock < 5) return InventoryStatus.LOW_STOCK;
        return InventoryStatus.AVAILABLE;
    }


    async createProduct(
        data: Partial<ProductInterface>,
        categoryId: number,
        subcategoryId: number,
        vendorId: number
    ): Promise<Product> {
        const {
            name,
            description,
            basePrice,
            discount,
            discountType,
            status, // need to remove this from frontend
            stock,
            dealId,
            bannerId,
            hasVariants,
            variants,
            productImages // frontend sends secure URLs
        } = data;

        // Normalize hasVariants to a boolean (handles string or boolean input)
        const isVariantProduct = hasVariants === true || hasVariants === 'true';

        // Validate category and subcategory
        const categoryExists = await this.categoryService.getCategoryById(categoryId);
        if (!categoryExists) throw new APIError(404, 'Category does not exist');

        const subcategoryExists = await this.subcategoryService.getSubcategoryById(subcategoryId, categoryId);
        if (!subcategoryExists) throw new APIError(404, 'Subcategory does not exist');

        if (!vendorId) throw new APIError(401, 'Unauthorized: Vendor not found');

        // Validate required fields based on product type
        if (!isVariantProduct) {
            if (basePrice == null || stock == null) {
                throw new APIError(400, 'Base price and stock are required for non-variant products');
            }
            if (!productImages || productImages.length === 0) {
                throw new APIError(400, 'At least one product image is required');
            }
        } else {
            if (!variants || variants.length === 0) {
                throw new APIError(400, 'Variants array is required for variant products');
            }
        }

        const finalPrice = this.calculateFinalPrice(Number(basePrice), Number(discount), discountType)

        // Create product
        const product = this.productRepository.create({
            name,
            description,
            basePrice: isVariantProduct ? null : parseFloat(basePrice || '0'),
            discount: parseFloat(discount || '0'),
            discountType: discountType || DiscountType.PERCENTAGE,
            status: this.determineOrderStatus(Number(stock)),
            stock: isVariantProduct ? null : parseInt(stock || '0'),
            subcategoryId,
            vendorId,
            finalPrice,
            brandId: data.brandId ? parseInt(data.brandId) : null,
            dealId: dealId ? parseInt(dealId) : null,
            bannerId: bannerId ? parseInt(bannerId) : null,
            productImages: isVariantProduct ? [] : productImages,
            hasVariants: isVariantProduct
        });

        const savedProduct = await this.productRepository.save(product);

        // Handle variants
        if (isVariantProduct && variants) {
            const savedVariants = await Promise.all(
                variants.map(async (variant) => {
                    const newVariant = this.variantRepository.create({
                        sku: variant.sku,
                        basePrice: parseFloat(variant.basePrice),
                        discount: product.discount || 0,
                        discountType: product.discountType || DiscountType.PERCENTAGE,
                        attributes: variant.attributes,
                        variantImages: variant.variantImages || [],
                        stock: parseInt(variant.stock),
                        status: variant.status || InventoryStatus.AVAILABLE,
                        productId: savedProduct.id.toString(),
                        product: savedProduct,
                        finalPrice: this.calculateFinalPrice(Number(variant.basePrice), Number(variant.discount), variant.discountType)
                    });

                    return this.variantRepository.save(newVariant);
                })
            );

            savedProduct.variants = savedVariants;
        }

        return savedProduct;
    }

    // util function to calculate final price after discount 
    private calculateFinalPrice(basePrice: number, discount: number, discountType: DiscountType) {
        if (!basePrice || basePrice <= 0) {
            return 0
        }

        if (discountType === DiscountType.FLAT) {
            return Math.max(0, basePrice - discount)
        }

        if (discountType === DiscountType.PERCENTAGE) {
            return Math.max(0, basePrice - (basePrice * discount) / 100);
        }
    }

    async updateProduct(
        authId: number,
        isAdmin: boolean,
        productId: number,
        data: Partial<ProductInterface>,
        categoryId: number,
        subcategoryId: number
    ): Promise<Product> {
        const {
            name,
            description,
            basePrice,
            discount,
            discountType,
            status,
            stock,
            dealId,
            bannerId,
            hasVariants,
            variants,
            brandId,
            productImages
        } = data;

        const whereClause = isAdmin ? { id: productId } : { id: productId, vendor: { id: authId } };
        const product = await this.productRepository.findOne({ where: whereClause, relations: ['variants'] });
        if (!product) throw new APIError(404, 'Product not found or not authorized');

        // Validate category & subcategory
        if (!(await this.categoryService.getCategoryById(categoryId))) throw new APIError(404, 'Category does not exist');
        if (!(await this.subcategoryService.getSubcategoryById(subcategoryId, categoryId))) throw new APIError(404, 'Subcategory does not exist');

        // Validate banner & deal
        if (dealId !== undefined && !(await this.dealService.getDealById(Number(dealId)))) throw new APIError(404, 'Deal does not exist');
        if (bannerId !== undefined && !(await this.bannerService.getBannerById(Number(bannerId)))) throw new APIError(404, 'Banner does not exist');

        // Normalize hasVariants to boolean
        const hasVariantsBool =
            hasVariants === true || hasVariants === 'true' ? true :
                hasVariants === false || hasVariants === 'false' ? false :
                    undefined;

        // Update product fields
        product.name = name ?? product.name;
        product.description = description ?? product.description;
        product.basePrice = hasVariantsBool ? null : (basePrice !== undefined ? parseFloat(basePrice.toString()) : product.basePrice);
        product.discount = discount !== undefined ? parseFloat(discount.toString()) : product.discount;
        product.discountType = discountType ?? product.discountType;
        product.status = this.determineOrderStatus(Number(stock));
        product.stock = hasVariantsBool ? null : (stock !== undefined ? parseInt(stock.toString()) : product.stock);
        product.subcategoryId = subcategoryId;
        product.dealId = dealId !== undefined ? parseInt(dealId.toString()) : product.dealId;
        product.bannerId = bannerId !== undefined ? parseInt(bannerId.toString()) : product.bannerId;
        product.brandId = brandId !== undefined ? parseInt(brandId.toString()) : product.brandId;
        if (hasVariantsBool !== undefined) product.hasVariants = hasVariantsBool;

        // Update product images (URLs from frontend)
        if (productImages && Array.isArray(productImages)) {
            if (productImages.length === 0 && !hasVariantsBool) {
                throw new APIError(400, 'At least one product image is required for non-variant products');
            }
            product.productImages = productImages;
        }

        // Handle variants
        if (hasVariantsBool && variants) {
            if (!Array.isArray(variants) || variants.length === 0) throw new APIError(400, 'Variants array is required for variant products');

            // Delete old variants if switching from non-variant to variant
            if (!product.hasVariants) await this.variantRepository.delete({ productId: productId.toString() });

            const savedVariants = await Promise.all(
                variants.map(async variant => {
                    const existingVariant = await this.variantRepository.findOne({ where: { sku: variant.sku, productId: productId.toString() } });

                    if (existingVariant) {
                        // Update existing variant
                        existingVariant.basePrice = parseFloat(variant.basePrice.toString());
                        existingVariant.discount = parseFloat(variant.discount?.toString() || '0');
                        existingVariant.discountType = variant.discountType || DiscountType.PERCENTAGE;
                        existingVariant.attributes = variant.attributes;
                        existingVariant.variantImages = variant.variantImages || existingVariant.variantImages;
                        existingVariant.stock = parseInt(variant.stock.toString());
                        existingVariant.status = this.determineOrderStatus(Number(variant.stock));
                        return this.variantRepository.save(existingVariant);
                    } else {
                        // Create new variant
                        const newVariant = this.variantRepository.create({
                            sku: variant.sku,
                            basePrice: parseFloat(variant.basePrice.toString()),
                            discount: parseFloat(variant.discount?.toString() || '0'),
                            discountType: variant.discountType || DiscountType.PERCENTAGE,
                            attributes: variant.attributes,
                            variantImages: variant.variantImages || [],
                            stock: parseInt(variant.stock.toString()),
                            status: this.determineOrderStatus(Number(variant.stock)),
                            productId: productId.toString(),
                            product
                        });
                        return this.variantRepository.save(newVariant);
                    }
                })
            );

            product.variants = savedVariants;
            product.hasVariants = true;
        }

        return await this.productRepository.save(product);
    }

    async getAllProducts(): Promise<Product[]> {
        return await this.productRepository.find({
            relations: ['subcategory', 'vendor', 'brand', 'deal', 'variants'],
            order: {
                created_at: 'DESC',
            },
        });
    }

    async filterProducts(params: IProductQueryParams) {
        const { page = 1, limit = config.pagination.pageLimit } = params

        const skip = (page - 1) * limit;

        const { brandId, categoryId, subcategoryId, dealId, sort = 'all', bannerId } = params;

        const query = this.productRepository.createQueryBuilder('product')
            .leftJoinAndSelect('product.subcategory', 'subcategory')
            .leftJoinAndSelect('product.brand', 'brand')
            .leftJoin('product.vendor', 'vendor')
            .addSelect([
                'vendor.id',
                'vendor.businessName',
                'vendor.districtId',
                'vendor.createdAt',
                'vendor.updatedAt'
            ])
            .leftJoinAndSelect('product.deal', 'deal')
            .leftJoinAndSelect('product.variants', 'variants')
            .where('(product.stock > 0 OR variants.stock > 0)');

        query.skip(skip).take(limit)


        if (bannerId) {
            const banner = await this.bannerRepository.findOne({ where: { id: bannerId } });
            if (!banner) throw new APIError(404, "Banner does not exist");
            query.andWhere('product.bannerId = :bannerId', { bannerId });
        }

        if (subcategoryId) {
            const subcategory = await this.subcategoryRepository.findOne({ where: { id: subcategoryId } });
            if (!subcategory) throw new APIError(404, 'Subcategory does not exist');
            query.andWhere('product.subcategoryId = :subcategoryId', { subcategoryId });
        } else if (categoryId) {
            const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
            if (!category) throw new APIError(404, 'Category does not exist');
            query.andWhere('subcategory.categoryId = :categoryId', { categoryId });
        }

        if (brandId) {
            const brand = await this.brandRepository.findOne({ where: { id: brandId } });
            if (!brand) throw new APIError(404, 'Brand does not exist');
            query.andWhere('product.brandId = :brandId', { brandId });
        }

        if (dealId) {
            const deal = await this.dealRepository.findOne({ where: { id: dealId } });
            if (!deal) throw new APIError(404, 'Deal does not exist');
            query.andWhere('product.dealId = :dealId', { dealId });
        }

        query.groupBy('product.id')
            .addGroupBy('subcategory.id')
            .addGroupBy('brand.id')
            .addGroupBy('vendor.id')
            .addGroupBy('deal.id')
            .addGroupBy('variants.id');

        if (sort === 'low-to-high') {
            query.addOrderBy(`
            LEAST(
                product.basePrice - CASE 
                    WHEN product.discountType = 'PERCENTAGE' THEN product.basePrice * product.discount / 100 
                    ELSE product.discount 
                END,
                COALESCE(MIN(variants.basePrice - CASE 
                    WHEN variants.discountType = 'PERCENTAGE' THEN variants.basePrice * variants.discount / 100
                    ELSE variants.discount
                END), product.basePrice)
            )
        `, 'ASC');
        } else if (sort === 'high-to-low') {
            query.addOrderBy(`
            GREATEST(
                product.basePrice - CASE 
                    WHEN product.discountType = 'PERCENTAGE' THEN product.basePrice * product.discount / 100 
                    ELSE product.discount 
                END,
                COALESCE(MAX(variants.basePrice - CASE 
                    WHEN variants.discountType = 'PERCENTAGE' THEN variants.basePrice * variants.discount / 100
                    ELSE variants.discount
                END), product.basePrice)
            )
        `, 'DESC');
        } else {
            query.orderBy('product.created_at', 'DESC');
        }

        const [data, total] = await query.getManyAndCount();

        return {
            data, total, page, limit, totalPages: Math.ceil(total / limit)
        }
    }

    async getAdminProducts(params: IAdminProductQueryParams): Promise<{ products: Product[]; total: number }> {
        const { page = 1, limit = 7, sort = 'createdAt', filter } = params;

        const query = this.productRepository.createQueryBuilder('product')
            .leftJoinAndSelect('product.vendor', 'vendor')
            .leftJoinAndSelect('product.variants', 'variants')
            .select([
                'product.id',
                'product.name',
                'product.basePrice',
                'product.stock',
                'product.productImages',
                'product.created_at',
                'vendor.id',
                'vendor.businessName',
                'variants.id',
                'variants.sku',
                'variants.basePrice',
                'variants.stock',
                'variants.status',
                'variants.variantImages',
            ]);

        //  Filtering
        if (filter === 'out_of_stock') {
            query.andWhere('(product.stock = 0 OR variants.stock = 0)');
        }

        //   Sorting
        switch (sort) {
            case 'name':
                query.orderBy('product.name', 'ASC');
                break;
            case 'oldest':
                query.orderBy('product.created_at', 'ASC');
                break;
            case 'newest':
                query.orderBy('product.created_at', 'DESC');
                break;
            case 'price_low_high':
                query.orderBy('product.basePrice', 'ASC');
                break;
            case 'price_high_low':
                query.orderBy('product.basePrice', 'DESC');
                break;
            default:
                query.orderBy('product.created_at', 'DESC'); 
                break;
        }

        // Pagination
        const skip = (page - 1) * limit;
        query.skip(skip).take(limit);

        const [products, total] = await query.getManyAndCount();

        return { products, total };
    }



    async getProductById(id: number, subcategoryId: number): Promise<Product | null> {
        return this.productRepository
            .createQueryBuilder('product')
            .leftJoinAndSelect('product.vendor', 'vendor')
            .leftJoinAndSelect('product.subcategory', 'subcategory')
            .leftJoinAndSelect('product.variants', 'variant')
            .where('product.id = :id', { id })
            .andWhere('subcategory.id = :subcategoryId', { subcategoryId })
            .getOne();
    }


    async getVendorIdByProductId(productId: number): Promise<number> {
        const product = await this.productRepository.findOne({
            where: { id: productId },
            select: ['vendorId'],
        });

        if (!product) {
            throw new APIError(404, 'Product not found');
        }

        return product.vendorId;
    }

    async deleteProduct(id: number, subcategoryId: number, userId: number): Promise<void> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new APIError(404, 'User not found');
        }

        const product = await this.productRepository.findOne({
            where: { id, subcategory: { id: subcategoryId } },
            relations: ['vendor'],
        });
        if (!product) {
            throw new APIError(404, 'Product not found');
        }

        if (user.role !== UserRole.ADMIN && product.vendor.id !== userId) {
            throw new APIError(403, 'You can only delete your own products');
        }

        await this.productRepository.delete(id);
    }

    async deleteProductImage(
        id: number,
        subcategoryId: number,
        userId: number,
        imageUrl: string
    ): Promise<Product | null> {
        const user = await this.userRepository.findOne({ where: { id: userId } });
        const vendor = !user
            ? await this.vendorRepository.findOne({ where: { id: userId } })
            : null;

        if (!user && !vendor) {
            throw new APIError(404, 'User not found');
        }

        // Fetch product with variants
        const product = await this.productRepository.findOne({
            where: { id, subcategory: { id: subcategoryId } },
            relations: ['vendor', 'variants'],
        });
        if (!product) {
            throw new APIError(404, 'Product not found');
        }

        const isAdmin = user?.role === UserRole.ADMIN;
        const isVendorOwner = vendor && product.vendor?.id === vendor.id;

        if (!isAdmin && !isVendorOwner) {
            throw new APIError(403, 'You can only delete images from your own products');
        }

        // Determine if the image belongs to the main product or a variant
        let updatedProductImages = product.productImages || [];
        let variantToUpdate: any = null;

        if (updatedProductImages.includes(imageUrl)) {
            // Image belongs to main product
            updatedProductImages = updatedProductImages.filter(img => img !== imageUrl);
        } else if (product.variants && product.variants.length > 0) {
            // Check each variant
            for (const variant of product.variants) {
                if (variant.variantImages?.includes(imageUrl)) {
                    variantToUpdate = variant;
                    variant.variantImages = variant.variantImages.filter(img => img !== imageUrl);
                    break;
                }
            }
        } else {
            throw new APIError(400, 'Image not found in product or variants');
        }

        // Delete image from Cloudinary
        const deletionResult = await this.imageDeletionService.deleteSingleImage(imageUrl);
        if (!deletionResult.success) {
            throw new APIError(500, `Failed to delete image: ${deletionResult.error || 'Unknown error'}`);
        }

        // Save changes
        if (variantToUpdate) {
            await this.variantRepository.save(variantToUpdate);
        } else {
            await this.productRepository.update(id, { productImages: updatedProductImages });
        }

        return this.productRepository.findOne({
            where: { id, subcategory: { id: subcategoryId } },
            relations: ['subcategory', 'vendor', 'variants'],
        });
    }


    async calculateProductPrice(
        product: Product
    ): Promise<{ finalPrice: number; vendorDiscount: number; dealDiscount: number }> {
        const vendorDiscount = product.discount || 0;
        let dealDiscount = 0;

        if (product.dealId && product.deal && product.deal.status === DealStatus.ENABLED) {
            dealDiscount = product.deal.discountPercentage;
        }

        const finalDiscount = vendorDiscount + dealDiscount;
        const finalPrice = product.basePrice - (product.basePrice * finalDiscount / 100);

        return { finalPrice, vendorDiscount, dealDiscount };
    }

    async getProductsByVendorId(
        vendorId: number,
        page: number,
        limit: number
    ): Promise<{ products: Product[]; total: number }> {
        // Verify vendor existence via vendor service
        const vendor = await this.vendorService.findVendorById(vendorId);
        if (!vendor) {
            throw new APIError(404, 'Vendor not found');
        }

        // Calculate number of records to skip based on pagination parameters
        const skip = (page - 1) * limit;

        // Find products with vendor relation filtered by vendorId, paginated with total count
        const [products, total] = await this.productRepository.findAndCount({
            where: { vendor: { id: vendorId } },
            relations: ['subcategory', 'vendor', "variants"],
            skip,
            take: limit,
        });

        return { products, total };
    }


    async deleteProductById(id: number) {
        const result = await this.productRepository.delete({ id });

        if (result.affected === 0) {
            throw new APIError(404, "Product does not exists")
        }
    }
}