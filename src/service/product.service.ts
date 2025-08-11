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
            relations: ['vendor'],
        });

        if (!product) {
            throw new APIError(404, `Product does not exist`);
        }

        return product;
    }


    async createProduct(
        data: ProductInterface,
        files: { productImages?: Express.Multer.File[] } | undefined,
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
            status,
            stock,
            dealId,
            bannerId,
        } = data;

        const categoryExists = await this.categoryService.getCategoryById(categoryId);
        if (!categoryExists) {
            throw new APIError(404, 'Category does not exist');
        }

        const subcategoryExists = await this.subcategoryService.getSubcategoryById(subcategoryId, categoryId);
        if (!subcategoryExists) {
            throw new APIError(404, 'Subcategory does not exist');
        }

        if (bannerId) {
            const bannerExists = await this.bannerService.getBannerById(bannerId);
            if (!bannerExists) {
                throw new APIError(404, 'Banner does not exist');
            }
        }

        if (dealId) {
            const dealExists = await this.dealService.getDealById(dealId);
            if (!dealExists) {
                throw new APIError(404, 'Deal does not exist');
            }
        }

        if (!vendorId) {
            throw new APIError(401, 'Unauthorized: Vendor not found');
        }

        let finalPrice: number | undefined;
        if (basePrice && discount && discountType) {
            finalPrice =
                discountType === DiscountType.PERCENTAGE
                    ? basePrice * (1 - discount / 100)
                    : basePrice - discount;
            if (finalPrice < 0) {
                throw new APIError(400, 'Discount results in negative price');
            }
        }

        const productImages = files?.productImages;
        if (!productImages || !Array.isArray(productImages) || productImages.length === 0) {
            throw new APIError(400, 'No image files provided');
        }
        const uploadedImages: string[] = [];

        const uploadImage = async (buffer: Buffer): Promise<string> => {
            return new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { resource_type: 'image' },
                    (error, result) => {
                        if (error || !result) {
                            return reject(new APIError(500, 'Image upload failed'));
                        }
                        resolve(result.secure_url);
                    }
                ).end(buffer);
            });
        };

        const imageUrls = await Promise.all(productImages.map(file => uploadImage(file.buffer)));
        uploadedImages.push(...imageUrls);

        const savedProduct = this.productRepository.create({
            name,
            description,
            basePrice,
            discount,
            discountType,
            status,
            stock,
            subcategoryId,
            vendorId,
            dealId: dealId ? dealId : null,
            bannerId: bannerId ? bannerId : null,
            productImages: imageUrls
        });

        return await this.productRepository.save(savedProduct);
    }

    async updateProduct(
        authId: number,
        isAdmin: boolean,
        productId: number,
        data: Partial<ProductInterface>,
        files: { productImages?: Express.Multer.File[] } | undefined,
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
        } = data;

        const whereClause = isAdmin
            ? { id: productId }
            : { id: productId, vendor: { id: authId } };
        const product = await this.productRepository.findOne({
            where: whereClause,
        });
        if (!product) {
            throw new APIError(404, 'Product not found or not authorized');
        }

        const categoryExists = await this.categoryService.getCategoryById(categoryId);
        if (!categoryExists) {
            throw new APIError(404, 'Category does not exist');
        }

        const subcategoryExists = await this.subcategoryService.getSubcategoryById(subcategoryId, categoryId);
        if (!subcategoryExists) {
            throw new APIError(404, 'Subcategory does not exist');
        }

        if (bannerId) {
            const bannerExists = await this.bannerService.getBannerById(bannerId);
            if (!bannerExists) {
                throw new APIError(404, 'Banner does not exist');
            }
        }

        if (dealId) {
            const dealExists = await this.dealService.getDealById(dealId);
            if (!dealExists) {
                throw new APIError(404, 'Deal does not exist');
            }
        }

        if (!authId) {
            throw new APIError(401, 'Unauthorized: User or Vendor not found');
        }

        let finalPrice: number | undefined;
        if (basePrice && discount && discountType) {
            finalPrice =
                discountType === DiscountType.PERCENTAGE
                    ? basePrice * (1 - discount / 100)
                    : basePrice - discount;
            if (finalPrice < 0) {
                throw new APIError(400, 'Discount results in negative price');
            }
        }

        let uploadedImages: string[] = product.productImages || [];

        const uploadImage = async (buffer: Buffer): Promise<string> => {
            return new Promise((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { resource_type: 'image' },
                    (error, result) => {
                        if (error || !result) {
                            return reject(new APIError(500, 'Image upload failed'));
                        }
                        resolve(result.secure_url);
                    }
                ).end(buffer);
            });
        };

        const productImages = files?.productImages;
        if (productImages && Array.isArray(productImages) && productImages.length > 0) {
            const imageUrls = await Promise.all(productImages.map(file => uploadImage(file.buffer)));
            uploadedImages = imageUrls;
        }

        product.name = name ?? product.name;
        product.description = description ?? product.description;
        product.basePrice = basePrice ?? product.basePrice;
        product.discount = discount ?? product.discount;
        product.discountType = discountType ?? product.discountType;
        product.status = status ?? product.status;
        product.stock = stock ?? product.stock;
        product.subcategoryId = subcategoryId;
        product.dealId = dealId !== undefined ? dealId : product.dealId;
        product.bannerId = bannerId !== undefined ? bannerId : product.bannerId;
        product.productImages = uploadedImages;

        const updatedProduct = await this.productRepository.save(product);

        return updatedProduct;
    }



    async getAllProducts(): Promise<Product[]> {
        return await this.productRepository.find({
            relations: ['subcategory', 'vendor', 'brand', 'deal'],
            order: {
                created_at: 'DESC',
            },
        });
    }

    async filterProducts(params: IProductQueryParams): Promise<Product[]> {
        const { brandId, categoryId, subcategoryId, dealId, sort = 'all', bannerId } = params;

        const query = this.productRepository.createQueryBuilder('product')
            .leftJoinAndSelect('product.subcategory', 'subcategory')
            .leftJoinAndSelect('product.brand', 'brand')
            .leftJoinAndSelect('product.vendor', 'vendor')
            .leftJoinAndSelect('product.deal', 'deal')
            .where('product.stock > 0');

        if (bannerId) {
            const banner = await this.bannerRepository.findOne({
                where: { id: bannerId }
            });

            if (!banner) {
                throw new APIError(404, "Banner does not exist");
            }

            query.andWhere('product.bannerId = :bannerId', { bannerId });
        }

        if (subcategoryId) {
            const subcategory = await this.subcategoryRepository.findOne({ where: { id: subcategoryId } });
            if (!subcategory) {
                throw new APIError(404, 'Subcategory does not exist');
            }
            query.andWhere('product.subcategoryId = :subcategoryId', { subcategoryId });
        } else if (categoryId) {
            const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
            if (!category) {
                throw new APIError(404, 'Category does not exist');
            }
            query.andWhere('subcategory.categoryId = :categoryId', { categoryId });
        }

        if (brandId) {
            const brand = await this.brandRepository.findOne({ where: { id: brandId } });
            if (!brand) {
                throw new APIError(404, 'Brand does not exist');
            }
            query.andWhere('product.brand_id = :brandId', { brandId });
        }

        if (dealId) {
            const deal = await this.dealRepository.findOne({ where: { id: dealId } });
            if (!deal) {
                throw new APIError(404, 'Deal does not exist');
            }
            query.andWhere('product.dealId = :dealId', { dealId });
        }

        if (sort === 'low-to-high') {
            query.orderBy(`
                product.basePrice - CASE 
                    WHEN product.discountType = 'PERCENTAGE' THEN product.basePrice * product.discount / 100 
                    ELSE product.discount 
                END
            `, 'ASC');
        } else if (sort === 'high-to-low') {
            query.orderBy(`
                product.basePrice - CASE 
                    WHEN product.discountType = 'PERCENTAGE' THEN product.basePrice * product.discount / 100 
                    ELSE product.discount 
                END
            `, 'DESC');
        } else {
            query.orderBy('product.created_at', 'DESC');
        }

        return await query.getMany();
    }

    async getAdminProducts(params: IAdminProductQueryParams): Promise<{ products: Product[]; total: number }> {
        const { page = 1, limit = 7, sort = 'createdAt' } = params;

        const query = this.productRepository.createQueryBuilder('product')
            .leftJoinAndSelect('product.vendor', 'vendor')
            .select([
                'product.id',
                'product.name',
                'product.basePrice',
                'product.stock',
                'product.created_at',
                'vendor.id',
                'vendor.name',
            ]);

        if (sort === 'name') {
            query.orderBy('product.name', 'ASC');
        } else {
            query.orderBy('product.created_at', 'DESC');
        }

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

        if (product.productImages && product.productImages.length > 0) {
            // Handle image deletion logic if needed
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
        const vendor = !user ?
            await this.vendorRepository.findOne({
                where: { id: userId }
            })
            : null;

        if (!user && !vendor) {
            throw new APIError(404, 'User not found');
        }

        const product = await this.productRepository.findOne({
            where: { id, subcategory: { id: subcategoryId } },
            relations: ['vendor'],
        });
        if (!product) {
            throw new APIError(404, 'Product not found');
        }

        const isAdmin = user?.role === UserRole.ADMIN;
        const isVendorOwner = vendor && product.vendor?.id === vendor.id;

        if (!isAdmin && !isVendorOwner) {
            throw new APIError(403, 'You can only delete images from your own products');
        }

        const deletionResult = await this.imageDeletionService.deleteSingleImage(imageUrl);
        if (!deletionResult.success) {
            throw new APIError(500, `Failed to delete image: ${deletionResult.error || 'Unknown error'}`);
        }

        await this.productRepository.update(id, { productImages: product.productImages });

        return this.productRepository.findOne({
            where: { id, subcategory: { id: subcategoryId } },
            relations: ['subcategory', 'vendor'],
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
            relations: ['subcategory', 'vendor'],
            skip,
            take: limit,
        });

        return { products, total };
    }


}