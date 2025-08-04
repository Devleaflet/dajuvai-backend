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
import { ProductVariant } from '../entities/productVariant.entity';
import { VariantImage } from '../entities/variantImages.entity';
import { VariantAttribute } from '../entities/variantAttribute.entity';
import { AttributeValue } from '../entities/attributeValue.entity';
import { AttributeType } from '../entities/attributeType.entity';


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
    private variantRepository: Repository<ProductVariant>;
    private variantImageRepository: Repository<VariantImage>;
    private variantAttributeRepository: Repository<VariantAttribute>;
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
    private attributeTypeRepository: Repository<AttributeType>;
    private attributeValueRepository: Repository<AttributeValue>;

    constructor(private dataSource: DataSource) {
        this.productRepository = this.dataSource.getRepository(Product);
        this.variantRepository = this.dataSource.getRepository(ProductVariant);
        this.variantImageRepository = this.dataSource.getRepository(VariantImage);
        this.variantAttributeRepository = this.dataSource.getRepository(VariantAttribute);
        this.categoryRepository = this.dataSource.getRepository(Category);
        this.subcategoryRepository = this.dataSource.getRepository(Subcategory);
        this.userRepository = this.dataSource.getRepository(User);
        this.vendorRepository = this.dataSource.getRepository(Vendor);
        this.dealRepository = this.dataSource.getRepository(Deal);
        this.brandRepository = this.dataSource.getRepository(Brand);
        this.bannerRepository = this.dataSource.getRepository(Banner);
        this.attributeTypeRepository = this.dataSource.getRepository(AttributeType);
        this.attributeValueRepository = this.dataSource.getRepository(AttributeValue);
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


    async getProducts() {
        return this.productRepository.find();
    }

    async createProduct(
        data: ProductInterface,
        files: Record<string, Express.Multer.File[]>,
        categoryId: number,
        subcategoryId: number,
        vendorId: number,
        hasVariants: boolean
    ): Promise<Product> {
        const {
            name,
            description,
            basePrice,
            discount,
            discountType,
            status,
            stock,
            variants,
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
        if (!hasVariants && basePrice && discount && discountType) {
            finalPrice =
                discountType === DiscountType.PERCENTAGE
                    ? basePrice * (1 - discount / 100)
                    : basePrice - discount;
            if (finalPrice < 0) {
                throw new APIError(400, 'Discount results in negative price');
            }
        }

        const uploadedImages: string[] = [];
        const variantImageMap: Record<string, string[]> = {};

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


        if (hasVariants && variants) {
            for (let i = 0; i < variants.length; i++) {
                const variant = variants[i];
                if (!variant.sku) {
                    throw new APIError(400, `Variant at index ${i} is missing SKU`);
                }

                const variantImageField = `variantImages${i + 1}`;
                const variantImageFiles = files[variantImageField] || [];

                if (variantImageFiles.length === 0) {
                    throw new APIError(400, `No images provided for variant ${variant.sku}`);
                }
                if (variantImageFiles.length > 5) {
                    throw new APIError(400, `Too many images for variant ${variant.sku}. Maximum is 5.`);
                }

                const imageUrls = await Promise.all(
                    variantImageFiles.map(file => uploadImage(file.buffer))
                );

                variantImageMap[variant.sku] = imageUrls;
                console.log(`Uploaded ${imageUrls.length} images for variant ${variant.sku}`);
            }
        } else {
            const productImageFiles = files['productImages'] || [];
            if (productImageFiles.length === 0) {
                throw new APIError(400, 'No product images provided');
            }
            if (productImageFiles.length > 5) {
                throw new APIError(400, 'Maximum 5 images allowed for non-variant products');
            }
            const imageUrls = await Promise.all(productImageFiles.map(file => uploadImage(file.buffer)));
            uploadedImages.push(...imageUrls);
        }

        console.log("Stock________________________________")

        console.log(stock);

        const savedProduct = await this.dataSource.transaction(async (transactionalEntityManager) => {
            const product = this.productRepository.create({
                name,
                description,
                basePrice: hasVariants ? undefined : basePrice,
                discount: discount ?? 0,
                discountType: discountType ?? DiscountType.PERCENTAGE,
                status: hasVariants ? undefined : (status ?? InventoryStatus.AVAILABLE),
                stock: hasVariants ? undefined : stock,
                hasVariants,
                subcategory: { id: subcategoryId },
                vendor: { id: vendorId },
                deal: dealId ? { id: dealId } : undefined,
                banner: bannerId ? { id: bannerId } : undefined,
            });

            const savedProduct = await transactionalEntityManager.save(Product, product);

            if (hasVariants && variants) {
                console.log('Creating variants for product:', savedProduct.id);

                const productVariants = await Promise.all(
                    variants.map(async (variantData, index) => {
                        console.log(`Creating variant ${index + 1}:`, variantData.sku);

                        try {
                            const variant = this.variantRepository.create({
                                sku: variantData.sku,
                                price: variantData.price,
                                stock: variantData.stock,
                                status: variantData.status,
                                product: { id: savedProduct.id },
                            });

                            const savedVariant = await transactionalEntityManager.save(ProductVariant, variant);
                            console.log(`Variant ${variantData.sku} created with ID:`, savedVariant.id);

                            // Handle attributes if they exist
                            if (variantData.attributes && variantData.attributes.length > 0) {
                                console.log(`Creating attributes for variant ${variantData.sku}`);

                                for (const attr of variantData.attributes) {
                                    try {
                                        // Create or find existing attribute type
                                        let attributeType = await transactionalEntityManager.findOne(AttributeType, {
                                            where: {
                                                name: attr.attributeType,
                                                productId: savedProduct.id
                                            }
                                        });

                                        if (!attributeType) {
                                            attributeType = this.attributeTypeRepository.create({
                                                name: attr.attributeType,
                                                product: { id: savedProduct.id },
                                            });
                                            attributeType = await transactionalEntityManager.save(AttributeType, attributeType);
                                            console.log(`Created attribute type: ${attr.attributeType}`);
                                        }

                                        // Create attribute values
                                        for (const value of attr.attributeValues) {
                                            const attributeValue = this.attributeValueRepository.create({
                                                value: value,
                                                attributeType: { id: attributeType.id },
                                            });
                                            const savedAttributeValue = await transactionalEntityManager.save(AttributeValue, attributeValue);

                                            // Create variant attribute relationship
                                            const variantAttribute = this.variantAttributeRepository.create({
                                                variant: { id: savedVariant.id },
                                                attributeValue: { id: savedAttributeValue.id },
                                            });
                                            await transactionalEntityManager.save(VariantAttribute, variantAttribute);
                                        }
                                    } catch (attrError) {
                                        console.error(`Error creating attributes for variant ${variantData.sku}:`, attrError);
                                        throw new APIError(500, `Failed to create attributes for variant ${variantData.sku}`);
                                    }
                                }
                            }

                            // Handle variant images
                            const variantImages = variantImageMap[variantData.sku] || [];
                            if (variantImages.length > 0) {
                                const images = variantImages.map((url) =>
                                    this.variantImageRepository.create({
                                        imageUrl: url,
                                        variant: { id: savedVariant.id },
                                        product: { id: savedProduct.id },
                                    })
                                );
                                await transactionalEntityManager.save(VariantImage, images);
                                console.log(`Created ${images.length} images for variant ${variantData.sku}`);
                            }

                            return savedVariant;
                        } catch (variantError) {
                            console.error(`Error creating variant ${variantData.sku}:`, variantError);
                            throw new APIError(500, `Failed to create variant ${variantData.sku}: ${variantError.message}`);
                        }
                    })
                );

                savedProduct.variants = productVariants;
                console.log(`Successfully created ${productVariants.length} variants`);
            } else {
                const images = uploadedImages.map((url) =>
                    this.variantImageRepository.create({
                        imageUrl: url,
                        product: { id: savedProduct.id },
                    })
                );
                await transactionalEntityManager.save(VariantImage, images);
                savedProduct.productImages = images;
            }

            return savedProduct;
        });

        // Fetch the complete product with all relations
        const completeProduct = await this.productRepository.findOne({
            where: { id: savedProduct.id },
            relations: [
                'variants',
                'variants.attributes',
                'variants.attributes.attributeValue',
                'variants.attributes.attributeValue.attributeType',
                'variants.images',
                'productImages',
                'attributeTypes',
                'subcategory',
                'vendor',
                'deal',
                'banner'
            ]
        });

        if (!completeProduct) {
            throw new APIError(500, 'Failed to fetch created product');
        }

        return completeProduct;
    }

    async updateProduct(
        authId: number,
        isAdmin: boolean,
        productId: number,
        data: Partial<ProductInterface>,
        files: Record<string, Express.Multer.File[]>,
        categoryId: number,
        subcategoryId: number
    ): Promise<Product> {
        const whereClause = isAdmin
            ? { id: productId }
            : { id: productId, vendor: { id: authId } };
        const product = await this.productRepository.findOne({
            where: whereClause,
            relations: ['variants', 'productImages', 'variants.attributes', 'variants.images'],
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

        if (data.bannerId) {
            const bannerExists = await this.bannerService.getBannerById(data.bannerId);
            if (!bannerExists) {
                throw new APIError(404, 'Banner does not exist');
            }
        }

        if (data.dealId) {
            const dealExists = await this.dealService.getDealById(data.dealId);
            if (!dealExists) {
                throw new APIError(404, 'Deal does not exist');
            }
        }

        if (!authId) {
            throw new APIError(401, 'Unauthorized: User or Vendor not found');
        }

        let finalPrice: number | undefined;
        if (!data.hasVariants && data.basePrice && data.discount && data.discountType) {
            finalPrice =
                data.discountType === DiscountType.PERCENTAGE
                    ? data.basePrice * (1 - data.discount / 100)
                    : data.basePrice - data.discount;
            if (finalPrice < 0) {
                throw new APIError(400, 'Discount results in negative price');
            }
        }

        const uploadedImages: string[] = [];
        const variantImageMap: Record<string, string[]> = {};

        const uploadImage = async (buffer: Buffer, originalname: string): Promise<string> => {
            try {
                // resize with sharp
                const compressedBuffer = await sharp(buffer)
                    .resize({ width: 1024 })
                    .jpeg({ quality: 80 })
                    .toBuffer();

                return new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream(
                        { resource_type: 'image' },
                        (error, result) => {
                            if (error || !result) {
                                console.error(`Cloudinary upload failed for file ${originalname}:`, error?.message || 'No result');
                                return reject(new APIError(500, `Image upload failed for ${originalname}`));
                            }
                            resolve(result.secure_url);
                        }
                    ).end(compressedBuffer);
                });
            } catch (error) {
                console.error(`Error processing image ${originalname}:`, error);
                throw new APIError(500, `Image processing failed for ${originalname}`);
            }
        };

        if (data.hasVariants && data.variants) {
            for (let i = 0; i < data.variants.length; i++) {
                const variant = data.variants[i];
                if (!variant.sku) {
                    throw new APIError(400, `Variant at index ${i} is missing SKU`);
                }

                const variantImageField = `variantImages${i + 1}`;
                const variantImageFiles = files[variantImageField] || [];

                if (variantImageFiles.length > 5) {
                    throw new APIError(400, `Too many images for variant ${variant.sku}. Maximum is 5.`);
                }

                if (variantImageFiles.length > 0) {
                    const imageUrls: string[] = [];
                    for (const file of variantImageFiles) {
                        if (!file.buffer || file.buffer.length === 0) {
                            throw new APIError(400, `Invalid or empty file buffer for ${file.originalname}`);
                        }
                        const url = await uploadImage(file.buffer, file.originalname);
                        imageUrls.push(url);
                        console.log(`Uploaded image ${file.originalname} for variant ${variant.sku}`);
                    }
                    variantImageMap[variant.sku] = imageUrls;
                }
            }
        } else {
            const productImageFiles = files['productImages'] || [];
            if (productImageFiles.length > 5) {
                throw new APIError(400, 'Maximum 5 images allowed for non-variant products');
            }
            if (productImageFiles.length > 0) {
                for (const file of productImageFiles) {
                    if (!file.buffer || file.buffer.length === 0) {
                        throw new APIError(400, `Invalid or empty file buffer for ${file.originalname}`);
                    }
                    const url = await uploadImage(file.buffer, file.originalname);
                    uploadedImages.push(url);
                    console.log(`Uploaded image ${file.originalname} for product`);
                }
            }
        }

        const updatedProduct = await this.dataSource.transaction(async (transactionalEntityManager) => {
            const productData = {
                name: data.name ?? product.name,
                description: data.description ?? product.description,
                basePrice: data.hasVariants ? undefined : (data.basePrice ?? product.basePrice),
                discount: data.discount ?? product.discount,
                discountType: data.discountType ?? product.discountType,
                status: data.hasVariants ? undefined : (data.status ?? product.status),
                stock: data.hasVariants ? undefined : (data.stock ?? product.stock),
                hasVariants: data.hasVariants ?? product.hasVariants,
                subcategory: data.subcategoryId ? { id: data.subcategoryId } : product.subcategory,
                vendor: { id: isAdmin ? product.vendor.id : authId },
                deal: data.dealId ? { id: data.dealId } : product.deal,
                banner: data.bannerId ? { id: data.bannerId } : product.banner,
            };

            await transactionalEntityManager.update(Product, { id: productId }, productData);
            const updatedProduct = await this.productRepository.findOneOrFail({
                where: { id: productId },
            });

            if (data.hasVariants && data.variants) {
                // Delete existing variants and related data
                await transactionalEntityManager.delete(VariantImage, { variant: { product: { id: productId } } });
                await transactionalEntityManager.delete(VariantAttribute, { variant: { product: { id: productId } } });
                await transactionalEntityManager.delete(ProductVariant, { product: { id: productId } });
                await transactionalEntityManager.delete(AttributeValue, { attributeType: { product: { id: productId } } });
                await transactionalEntityManager.delete(AttributeType, { product: { id: productId } });

                const productVariants = await Promise.all(
                    data.variants.map(async (variantData, index) => {
                        const variant = this.variantRepository.create({
                            sku: variantData.sku,
                            price: variantData.price,
                            stock: variantData.stock,
                            status: variantData.status,
                            product: { id: updatedProduct.id },
                        });

                        const savedVariant = await transactionalEntityManager.save(ProductVariant, variant);
                        console.log(`Updated variant ${variantData.sku} with ID: ${savedVariant.id}`);

                        if (variantData.attributes) {
                            const attributes = await Promise.all(
                                variantData.attributes.map(async (attr) => {
                                    const attributeType = this.attributeTypeRepository.create({
                                        name: attr.attributeType,
                                        product: { id: updatedProduct.id },
                                    });
                                    const savedAttributeType = await transactionalEntityManager.save(AttributeType, attributeType);
                                    console.log(`Created attribute type: ${attr.attributeType}`);

                                    const attributeValues = attr.attributeValues.map((value) =>
                                        this.attributeValueRepository.create({
                                            value,
                                            attributeType: { id: savedAttributeType.id },
                                        })
                                    );
                                    const savedAttributeValues = await transactionalEntityManager.save(AttributeValue, attributeValues);

                                    return savedAttributeValues.map((savedValue) =>
                                        this.variantAttributeRepository.create({
                                            variant: { id: savedVariant.id },
                                            attributeValue: { id: savedValue.id },
                                        })
                                    );
                                })
                            );

                            const flattenedAttributes = attributes.flat();
                            await transactionalEntityManager.save(VariantAttribute, flattenedAttributes);
                        }

                        const images = (variantImageMap[variantData.sku] || []).map((url) =>
                            this.variantImageRepository.create({
                                imageUrl: url,
                                variant: { id: savedVariant.id },
                                product: { id: updatedProduct.id },
                            })
                        );
                        if (images.length > 0) {
                            await transactionalEntityManager.save(VariantImage, images);
                            console.log(`Created ${images.length} images for variant ${variantData.sku}`);
                        }

                        return savedVariant;
                    })
                );

                updatedProduct.variants = productVariants;
            } else {
                if (uploadedImages.length > 0) {
                    await transactionalEntityManager.delete(VariantImage, { product: { id: productId } });
                    const images = uploadedImages.map((url) =>
                        this.variantImageRepository.create({
                            imageUrl: url,
                            product: { id: updatedProduct.id },
                        })
                    );
                    await transactionalEntityManager.save(VariantImage, images);
                    updatedProduct.productImages = images;
                }
            }

            return updatedProduct;
        });

        // Fetch the complete product 
        const completeProduct = await this.productRepository.findOne({
            where: { id: updatedProduct.id },
            relations: [
                'variants',
                'variants.attributes',
                'variants.attributes.attributeValue',
                'variants.attributes.attributeValue.attributeType',
                'variants.images',
                'productImages',
                'attributeTypes',
                'subcategory',
                'vendor',
                'deal',
                'banner'
            ]
        });

        if (!completeProduct) {
            throw new APIError(500, 'Failed to fetch updated product');
        }

        return completeProduct;
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
            query.andWhere('product.subcategory_id = :subcategoryId', { subcategoryId });
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

    async deleteProductById(id: number) {
        const result = await this.productRepository.delete({ id });

        if (result.affected === 0) {
            throw new APIError(404, "Product does not exists")
        }
    }


}