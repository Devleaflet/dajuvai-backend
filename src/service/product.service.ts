import { Repository } from 'typeorm';
import { DiscountType, Product } from '../entities/product.entity';
import { Subcategory } from '../entities/subcategory.entity';
import { User, UserRole } from '../entities/user.entity';
import AppDataSource from '../config/db.config';
import { v2 as cloudinary } from 'cloudinary';
import { CreateProductInput, UpdateProductInput, updateProductSchema } from "../utils/zod_validations/product.zod";
import { APIError } from '../utils/ApiError.utils';
import { Vendor } from '../entities/vendor.entity';
import { VendorService } from './vendor.service';
import { IProductQueryParams, IAdminProductQueryParams } from '../interface/product.interface';
import { Deal, DealStatus } from '../entities/deal.entity';
import { ImageUploadOptions, ImageUploadService } from './image.upload.service';
import { ImageDeletionService } from './image.delete.service';
import { Category } from '../entities/category.entity';
import { Brand } from '../entities/brand.entity';
import { Banner } from '../entities/banner.entity';

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
    // Repository for performing database operations on Product entities
    private productRepository: Repository<Product>;

    // Repository for Category entities
    private categoryRepository: Repository<Category>;

    // Repository for Subcategory entities
    private subcategoryRepository: Repository<Subcategory>;

    // Repository for User entities
    private userRepository: Repository<User>;

    // Repository for Vendor entities
    private vendorRepository: Repository<Vendor>;

    // Repository for Deal entities (e.g., discounts, offers)
    private dealRepository: Repository<Deal>;

    // Repository for Brand entities
    private brandRepository: Repository<Brand>;

    // Service for handling vendor-specific logic and data
    private vendorService: VendorService;

    // Service responsible for uploading product images
    private imageUploadService: ImageUploadService;

    // Service responsible for deleting product images
    private imageDeletionService: ImageDeletionService;

    private bannerRepository: Repository<Banner>;


    /**
     * Constructs a new instance of ProductService.
     *
     * Initializes repositories for various entities such as Product, Category,
     * Subcategory, User, Vendor, Deal, and Brand using the AppDataSource.
     * Also initializes auxiliary services for vendor management and image
     * upload/deletion.
     *
     * Configures the Cloudinary SDK with credentials from environment variables
     * to enable image hosting and management.
     */
    constructor() {
        // Initialize repository for Product entity
        this.productRepository = AppDataSource.getRepository(Product);

        // Initialize repository for Category entity
        this.categoryRepository = AppDataSource.getRepository(Category);

        // Initialize repository for Subcategory entity
        this.subcategoryRepository = AppDataSource.getRepository(Subcategory);

        // Initialize repository for User entity
        this.userRepository = AppDataSource.getRepository(User);

        // Initialize repository for Vendor entity
        this.vendorRepository = AppDataSource.getRepository(Vendor);

        // Initialize repository for Deal entity
        this.dealRepository = AppDataSource.getRepository(Deal);

        // Initialize repository for Brand entity
        this.brandRepository = AppDataSource.getRepository(Brand);

        // Instantiate VendorService for vendor-specific business logic
        this.vendorService = new VendorService();

        // Instantiate ImageUploadService to handle image uploads
        this.imageUploadService = new ImageUploadService();

        // Instantiate ImageDeletionService to handle image deletions
        this.imageDeletionService = new ImageDeletionService();

        this.bannerRepository = AppDataSource.getRepository(Banner);

        // Configure Cloudinary SDK with credentials for image hosting
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });
    }




    /**
     * Retrieves all products with their related entities.
     *
     * Fetches products from the database including related subcategory, vendor,
     * brand, deal, and reviews. Results are ordered by creation date in descending order.
     *
     * @returns {Promise<Product[]>} A promise that resolves to an array of Product entities.
     * @access Public
     */
    async getAlllProducts(): Promise<Product[]> {
        // Query all products with specified relations and order by created_at descending
        return this.productRepository.find({
            relations: ['subcategory', 'vendor', 'brand', 'deal', 'reviews'],
            order: {
                created_at: 'DESC',
            },
        });
    }

    /**
     * Retrieves detailed information about a product by its ID.
     *
     * Finds a product by the given productId, including its vendor relation.
     * Throws an APIError if no product is found with the given ID.
     *
     * @param {number} productId - The unique identifier of the product to retrieve.
     * @returns {Promise<Product>} A promise that resolves to the Product entity.
     * @throws {APIError} Throws 404 error if product not found.
     * @access Public
     */
    async getProductDetailsById(productId: number): Promise<Product> {
        // Find the product with vendor relation by ID
        const product = await this.productRepository.findOne({
            where: { id: productId },
            relations: ['vendor'],
        });

        // Throw error if product is not found
        if (!product) {
            throw new APIError(404, `Product does not exist`);
        }

        // Return the found product
        return product;
    }




    /**
     * Creates a new product for a vendor with associated category, subcategory, and optional deal.
     *
     * Validates the category, subcategory, vendor, and deal (if provided).
     * Uploads product images to Cloudinary.
     * Calculates final price based on discounts and deal.
     * Throws errors for invalid inputs or discount constraints.
     *
     * @param {CreateProductInput} dto - Product details including name, description, base price, stock, discount, discount type, size, and optional dealId.
     * @param {number} subcategoryId - ID of the subcategory the product belongs to.
     * @param {number} categoryId - ID of the category the product belongs to.
     * @param {number} vendorId - ID of the vendor creating the product.
     * @param {Express.Multer.File[]} files - Array of product image files to upload.
     * @returns {Promise<Product>} The newly created and saved product entity.
     * @throws {APIError} Throws errors if validation fails or upload issues occur.
     * @access Vendor
     */
    async createVendorProduct(
        dto: CreateProductInput,
        subcategoryId: number,
        categoryId: number,
        vendorId: number,
        files: Express.Multer.File[]
    ): Promise<Product> {
        const {
            name,
            description,
            basePrice,
            stock,
            discount,
            discountType = DiscountType.PERCENTAGE,
            size = [],
            dealId,
            bannerId
        } = dto;

        // Validate category existence
        const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
        if (!category) {
            throw new APIError(404, 'Category not found');
        }

        // Validate subcategory existence and ensure it belongs to the specified category
        const subcategory = await this.subcategoryRepository.findOne({
            where: { id: subcategoryId, category: { id: categoryId } },
            relations: ['category'],
        });
        if (!subcategory) {
            throw new APIError(404, 'Subcategory not found or does not belong to the specified category');
        }

        // Validate vendor existence
        const vendor = await this.vendorRepository.findOne({ where: { id: vendorId } });
        if (!vendor) {
            throw new APIError(404, 'Vendor not found');
        }

        // Validate deal if provided and ensure it is enabled
        let deal: Deal | null = null;
        if (dealId) {
            deal = await this.dealRepository.findOne({
                where: { id: dealId, status: DealStatus.ENABLED },
            });
            if (!deal) {
                throw new APIError(400, 'Deal is not enabled or does not exist');
            }
        }

        // Validate banner if provided
        if (bannerId) {
            const bannerExists = await this.bannerRepository.findOne({
                where: { id: bannerId }
            });
            if (!bannerExists) {
                throw new APIError(404, "Banner does not exist");
            }
        }

        // Upload product images to Cloudinary, if files are provided
        let productImages: string[] = [];
        if (files && files.length > 0) {
            const uploadPromises = files.map(file =>
                new Promise<string>((resolve, reject) => {
                    cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                        if (error || !result) {
                            return reject(new APIError(500, 'Image upload failed'));
                        }
                        resolve(result.secure_url);
                    }).end(file.buffer);
                })
            );
            productImages = await Promise.all(uploadPromises);
        }

        // Calculate final price considering discount type and deal discount
        let finalPrice = basePrice;
        if (discountType === DiscountType.PERCENTAGE) {
            // Apply vendor percentage discount
            finalPrice -= (basePrice * (discount || 0)) / 100;
        } else {
            // Apply vendor flat discount
            finalPrice -= (discount || 0);
        }

        // Apply deal discount if applicable
        if (deal) {
            finalPrice -= (basePrice * deal.discountPercentage) / 100;
        }

        // Ensure final price is non-negative
        if (finalPrice < 0) {
            throw new APIError(400, 'Final price after discounts cannot be negative');
        }
        finalPrice = parseFloat(finalPrice.toFixed(2));

        // Create the product entity with validated and computed fields
        const product = this.productRepository.create({
            name,
            description,
            basePrice,
            stock,
            discount: discount || 0,
            discountType,
            size,
            productImages,
            subcategory,
            vendor, // Relation to Vendor entity
            vendorId, // Foreign key
            deal,
            dealId: deal ? deal.id : null
        });

        console.log(product)
        // Persist the product in the database and return it
        const savedProduct = await this.productRepository.save(product);
        return savedProduct;
    }



    /**
     * Retrieves all products with their associated subcategory, vendor, brand, and deal information.
     *
     * Products are ordered by their creation date in descending order.
     *
     * @returns {Promise<Product[]>} A promise that resolves to an array of Product entities.
     * @access Public
     */
    async getAllProducts(): Promise<Product[]> {
        // Fetch all products including related entities, ordered by creation date descending
        return await this.productRepository.find({
            relations: ['subcategory', 'vendor', 'brand', 'deal'],
            order: {
                created_at: 'DESC',
            },
        });
    }



    /**
     * Filters products based on provided query parameters including brand, category, subcategory, deal, and sorting order.
     * 
     * Validates existence of referenced entities (subcategory, category, brand, deal) before filtering.
     * Only products with stock greater than zero are included.
     * Supports sorting by price after discount (low-to-high or high-to-low) or by creation date (default).
     * 
     * @param {IProductQueryParams} params - Filtering and sorting parameters including:
     *   - brandId?: number
     *   - categoryId?: number
     *   - subcategoryId?: number
     *   - dealId?: number
     *   - sort?: 'all' | 'low-to-high' | 'high-to-low'
     * 
     * @returns {Promise<Product[]>} Promise resolving to an array of filtered products.
     * 
     * @throws {APIError} Throws 404 error if any referenced entity (brand, category, subcategory, deal) does not exist.
     * 
     * @access Public
     */
    async filterProducts(params: IProductQueryParams): Promise<Product[]> {
        console.log('Filter params:', params);

        const { brandId, categoryId, subcategoryId, dealId, sort = 'all', bannerId } = params;

        // Start building the query with joins and base condition (stock > 0)
        const query = this.productRepository.createQueryBuilder('product')
            .leftJoinAndSelect('product.subcategory', 'subcategory')
            .leftJoinAndSelect('product.brand', 'brand')
            .leftJoinAndSelect('product.vendor', 'vendor')
            .leftJoinAndSelect('product.deal', 'deal')
            .where('product.stock > 0');

        if (bannerId) {
            const banner = this.bannerRepository.findOne({
                where: {
                    id: bannerId
                }
            })

            if (!banner) {
                throw new APIError(404, "Banner doesnot exists")
            }

            query.andWhere('product.bannerId = :bannerId', { bannerId });
        }

        // Filter by subcategory if provided, validate existence
        if (subcategoryId) {
            const subcategory = await this.subcategoryRepository.findOne({ where: { id: subcategoryId } });
            if (!subcategory) {
                throw new APIError(404, 'Subcategory does not exist');
            }
            query.andWhere('product.subcategory_id = :subcategoryId', { subcategoryId });
        }
        // Otherwise filter by category if provided, validate existence
        else if (categoryId) {
            const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
            if (!category) {
                throw new APIError(404, 'Category does not exist');
            }
            query.andWhere('subcategory.categoryId = :categoryId', { categoryId });
        }

        // Filter by brand if provided, validate existence
        if (brandId) {
            const brand = await this.brandRepository.findOne({ where: { id: brandId } });
            if (!brand) {
                throw new APIError(404, 'Brand does not exist');
            }
            query.andWhere('product.brand_id = :brandId', { brandId });
        }

        // Filter by deal if provided, validate existence
        if (dealId) {
            const deal = await this.dealRepository.findOne({ where: { id: dealId } });
            if (!deal) {
                throw new APIError(404, 'Deal does not exist');
            }
            query.andWhere('product.dealId = :dealId', { dealId });
        }

        // Apply sorting logic
        if (sort === 'low-to-high') {
            // Order by effective price ascending (basePrice minus discount)
            query.orderBy(`
            product.basePrice - CASE 
                WHEN product.discountType = 'PERCENTAGE' THEN product.basePrice * product.discount / 100 
                ELSE product.discount 
            END
        `, 'ASC');
        } else if (sort === 'high-to-low') {
            // Order by effective price descending (basePrice minus discount)
            query.orderBy(`
            product.basePrice - CASE 
                WHEN product.discountType = 'PERCENTAGE' THEN product.basePrice * product.discount / 100 
                ELSE product.discount 
            END
        `, 'DESC');
        } else {
            // Default ordering by most recently created products first
            query.orderBy('product.created_at', 'DESC');
        }

        // Debug logs for generated SQL and parameters
        console.log('Generated SQL:', query.getSql());
        console.log('Query parameters:', query.getParameters());

        // Execute and return filtered products
        return await query.getMany();
    }


    /**
     * Retrieves paginated products for the admin panel with optional sorting.
     * Returns selected product fields along with associated vendor info.
     * 
     * Supports pagination with default page=1 and limit=7.
     * Supports sorting by product name (alphabetical) or creation date (newest first).
     * 
     * @param {IAdminProductQueryParams} params - Query parameters including:
     *   - page?: number - page number for pagination (default 1)
     *   - limit?: number - number of products per page (default 7)
     *   - sort?: string - sorting field, 'name' or 'createdAt' (default 'createdAt')
     * 
     * @returns {Promise<{ products: Product[], total: number }>} Object containing
     *   paginated products array and total count of products.
     * 
     * @access Admin
     */
    async getAdminProducts(params: IAdminProductQueryParams): Promise<{ products: Product[]; total: number }> {
        // Default pagination and sorting values
        const { page = 1, limit = 7, sort = 'createdAt' } = params;

        // Initialize query builder on 'product' entity
        const query = this.productRepository.createQueryBuilder('product')
            // Join vendor relation for vendor details
            .leftJoinAndSelect('product.vendor', 'vendor')
            // Select specific fields for performance optimization
            .select([
                'product.id',
                'product.name',
                'product.basePrice',
                'product.stock',
                'product.created_at',
                'vendor.id',
                'vendor.name',
            ]);

        // Apply sorting based on requested field
        if (sort === 'name') {
            // Sort alphabetically by product name ascending
            query.orderBy('product.name', 'ASC');
        } else {
            // Default: sort by newest products first (creation date descending)
            query.orderBy('product.created_at', 'DESC');
        }

        // Calculate offset for pagination
        const skip = (page - 1) * limit;
        // Apply pagination: skip offset and limit number of results
        query.skip(skip).take(limit);

        // Execute query to get products and total count (for pagination)
        const [products, total] = await query.getManyAndCount();

        // Return paginated product list and total count
        return { products, total };
    }




    /**
   * Retrieves a product by its ID and verifies it belongs to the specified subcategory.
   *
   * @param {number} id - The unique ID of the product.
   * @param {number} subcategoryId - The ID of the subcategory to which the product must belong.
   * @returns {Promise<Product | null>} The product with vendor and subcategory relations, or null if not found.
   * 
   * @access Public (or depends on usage context)
   */
    async getProductById(id: number, subcategoryId: number): Promise<Product | null> {
        return this.productRepository
            .createQueryBuilder('product')
            .leftJoinAndSelect('product.vendor', 'vendor')
            .leftJoinAndSelect('product.subcategory', 'subcategory')
            .where('product.id = :id', { id })
            .andWhere('subcategory.id = :subcategoryId', { subcategoryId })
            .getOne();
    }



    /**
     * Updates a product's details if the user has permission.
     * Admin users can update any product; vendors can update only their own products.
     * Also handles validation of deals, discounts, and image uploads.
     * 
     * @param {number} id - The ID of the product to update.
     * @param {UpdateProductInput} dto - The data transfer object containing update fields.
     * @param {number} subcategoryId - The subcategory ID for product validation.
     * @param {number} vendorId - The vendor ID for ownership validation.
     * @param {Express.Multer.File[]} files - Uploaded image files to update product images.
     * @param {User} user - The authenticated user performing the update.
     * 
     * @throws {APIError} Throws if product/vendor not found, access denied, or validation fails.
     * 
     * @returns {Promise<Product | null>} The updated product with relations.
     * 
     * @access Admin or Vendor (with restrictions)
     */
    async updateProduct(
        id: number,
        dto: UpdateProductInput,
        subcategoryId: number,
        vendorId: number,
        files: Express.Multer.File[],
        user?: User
    ): Promise<Product | null> {
        let product: Product | null;

        // Admin can update any product in the specified subcategory
        if (user) {
            if (user.role === UserRole.ADMIN) {
                product = await this.productRepository.findOne({
                    where: { id, subcategory: { id: subcategoryId } },
                    relations: ["deal"]
                });
            }
        } else {
            // Vendor can update only their own product
            const vendor = await this.vendorRepository.findOne({ where: { id: vendorId } });
            if (!vendor) {
                throw new APIError(404, 'Vendor not found');
            }

            product = await this.productRepository.findOne({
                where: { id, subcategory: { id: subcategoryId }, vendor: { id: vendorId } },
                relations: ["deal"]
            });
        }

        if (!product) {
            throw new APIError(404, 'Product not found or access denied');
        }

        // Validate deal if dealId provided in dto
        let deal: Deal | null = null;
        if (dto.dealId !== undefined) {
            if (dto.dealId) {
                deal = await this.dealRepository.findOne({ where: { id: dto.dealId, status: DealStatus.ENABLED } });
                if (!deal) {
                    throw new APIError(400, 'Deal is not enabled or does not exist');
                }
            }
        } else {
            // If no dealId in dto, retain existing deal
            deal = product.deal;
        }

        // Handle image uploads and get updated product images
        const productImages = await this.handleImageUploads(files, product, id);

        // Use discount and discountType from dto if provided, otherwise fall back to existing product values
        const discount = dto.discount !== undefined ? dto.discount : product.discount;
        const discountType = dto.discountType ?? product.discountType;

        // Use basePrice from dto if provided, otherwise fall back to existing product value
        const basePrice = dto.basePrice ?? product.basePrice;

        // Validate basePrice
        if (!basePrice || basePrice <= 0) {
            throw new APIError(400, 'Base price must be a positive number');
        }

        // Calculate final price considering discount type and deal discount
        let finalPrice = basePrice;
        if (discountType === DiscountType.PERCENTAGE) {
            finalPrice -= (basePrice * (discount || 0)) / 100;
        } else {
            finalPrice -= (discount || 0);
        }

        // Apply deal discount if applicable
        if (deal) {
            finalPrice -= (basePrice * deal.discountPercentage) / 100;
        }

        // Ensure final price is non-negative
        if (finalPrice < 0) {
            throw new APIError(400, 'Final price after discounts cannot be negative');
        }
        finalPrice = parseFloat(finalPrice.toFixed(2));

        // Log for debugging
        console.log({
            dto,
            discount,
            discountType,
            basePrice,
            finalPrice,
            dealId: dto.dealId,
            productImages,
            vendorId,
            subcategoryId
        });

        // Update the product with new values and images
        await this.productRepository.update(id, {
            name: dto.name ?? product.name,
            description: dto.description ?? product.description,
            basePrice,
            stock: dto.stock ?? product.stock,
            quantity: dto.quantity ?? product.quantity,
            discount: discount || 0,
            discountType,
            size: dto.size ?? product.size,
            dealId: dto.dealId !== undefined ? dto.dealId || null : product.dealId,
            brand_id: dto.brand_id !== undefined ? dto.brand_id : product.brand_id,
            vendorId: dto.vendorId !== undefined ? dto.vendorId : product.vendor?.id,
            userId: dto.userId !== undefined ? dto.userId : product.userId,
            productImages,
        });

        // Return the updated product with relations
        const updatedProduct = await this.productRepository.findOne({
            where: { id, subcategory: { id: subcategoryId } },
            relations: ['subcategory', 'vendor', 'brand', 'deal']
        });

        if (!updatedProduct) {
            throw new APIError(404, 'Product not found after update');
        }

        return updatedProduct;
    }


    /**
     * Handles uploading multiple images for a product, merging new image URLs with existing ones.
     * 
     * @param {Express.Multer.File[]} files - Array of image files to upload.
     * @param {Product} product - The existing product entity, used to get current images.
     * @param {number} productId - The ID of the product being updated (used for folder and naming).
     * 
     * @returns {Promise<string[]>} An array of URLs of all product images after upload.
     * 
     * @throws Throws an error if image upload fails.
     * 
     * @access Private (internal helper)
     */
    private async handleImageUploads(
        files: Express.Multer.File[],
        product: Product,
        productId: number
    ): Promise<string[]> {
        // Get existing product images or initialize empty array
        let productImages = product.productImages || [];

        if (files && files.length > 0) {
            console.log(`Processing ${files.length} image(s) for product ${productId}`);

            // Define Cloudinary upload options for images
            const uploadOptions: ImageUploadOptions = {
                folder: 'products',
                width: 1200,
                height: 1200,
                quality: 'auto',
                format: 'jpg',
                crop: 'limit',
                publicIdPrefix: `product_${productId}`
            };

            try {
                // Upload multiple images to Cloudinary
                const uploadResults = await this.imageUploadService.uploadMultipleImages(files, uploadOptions);
                // Extract URLs from upload results
                const newImageUrls = uploadResults.map(result => result.url);
                // Merge new URLs with existing product images
                productImages = [...productImages, ...newImageUrls];

                console.log(`✓ Successfully uploaded ${newImageUrls.length} image(s) for product ${productId}`);
            } catch (error) {
                console.error('Image upload failed:', error);
                // Rethrow error to be handled by caller
                throw error;
            }
        }

        // Return updated array of product image URLs
        return productImages;
    }



    /**
     * Deletes a product by ID and subcategory ID if the user has permission.
     * Also deletes all associated product images from Cloudinary.
     * 
     * @param {number} id - The ID of the product to delete.
     * @param {number} subcategoryId - The subcategory ID the product belongs to.
     * @param {number} userId - The ID of the user requesting deletion (used for permission check).
     * 
     * @throws {APIError} Throws if user or product not found, or if user lacks permission.
     * 
     * @returns {Promise<void>} No return value.
     * 
     * @access Admin or Vendor (own products only)
     */
    async deleteProduct(id: number, subcategoryId: number, userId: number): Promise<void> {
        // Find user by ID to validate existence and role
        const user = await this.userRepository.findOne({ where: { id: userId } });
        if (!user) {
            throw new APIError(404, 'User not found');
        }

        // Find product by ID and subcategory with vendor relation for permission check
        const product = await this.productRepository.findOne({
            where: { id, subcategory: { id: subcategoryId } },
            relations: ['vendor'],
        });
        if (!product) {
            throw new APIError(404, 'Product not found');
        }

        // Only admins or product owner vendors can delete product
        if (user.role !== UserRole.ADMIN && product.vendor.id !== userId) {
            throw new APIError(403, 'You can only delete your own products');
        }

        // Delete product images from Cloudinary if any
        if (product.productImages && product.productImages.length > 0) {
            // Extract public IDs from image URLs
            const publicIds = product.productImages.map(url => url.split('/').pop()?.split('.')[0] || '');
            // Destroy each image asynchronously on Cloudinary
            await Promise.all(publicIds.map(id => cloudinary.uploader.destroy(id)));
        }

        // Delete product record from the database
        await this.productRepository.delete(id);
    }



    /**
     * Deletes a single product image URL from the specified product if the user has permission.
     * Also removes the image from the external storage via ImageDeletionService.
     * 
     * @param {number} id - The product ID.
     * @param {number} subcategoryId - The subcategory ID of the product.
     * @param {number} userId - The ID of the user requesting the deletion.
     * @param {string} imageUrl - The full URL of the image to delete.
     * 
     * @throws {APIError} Throws if user or product not found, user lacks permission, or image deletion fails.
     * 
     * @returns {Promise<Product | null>} Returns the updated product entity with relations after image deletion.
     * 
     * @access Admin or Vendor (own products only)
     */
    async deleteProductImage(
        id: number,
        subcategoryId: number,
        userId: number,
        imageUrl: string
    ): Promise<Product | null> {
        // Find the user by ID to verify existence and role
        const user = await this.userRepository.findOne({ where: { id: userId } });

        // if not a user, try vendor
        const vendor = !user ?
            await this.vendorRepository.findOne({
                where: {
                    id: userId
                }
            })
            :
            null;

        if (!user && !vendor) {
            throw new APIError(404, 'User not found');
        }

        // Find product by ID and subcategory, include vendor relation for permission check
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

        // Find index of the image URL in the product images array
        const imageIndex = product.productImages?.indexOf(imageUrl) ?? -1;
        if (imageIndex === -1) {
            throw new APIError(404, 'Image not found');
        }

        // Delete image using the image deletion service
        const deletionResult = await this.imageDeletionService.deleteSingleImage(imageUrl);
        if (!deletionResult.success) {
            throw new APIError(500, `Failed to delete image: ${deletionResult.error || 'Unknown error'}`);
        }

        // Remove image URL from product's image list
        product.productImages.splice(imageIndex, 1);

        // Update the product in the database with the new image list
        await this.productRepository.update(id, { productImages: product.productImages });

        // Return the updated product with related entities
        return this.productRepository.findOne({
            where: { id, subcategory: { id: subcategoryId } },
            relations: ['subcategory', 'vendor'],
        });
    }


    /**
     * Retrieves a paginated list of products belonging to a specific vendor.
     * 
     * @param {number} vendorId - The ID of the vendor whose products are to be fetched.
     * @param {number} page - The page number for pagination (1-based).
     * @param {number} limit - The number of products to retrieve per page.
     * 
     * @throws {APIError} Throws if the vendor does not exist.
     * 
     * @returns {Promise<{ products: Product[]; total: number }>} An object containing the list of products and the total count of products for the vendor.
     * 
     * @access Public (or depending on business logic)
     */
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


    /**
     * Calculates the final price of a product after applying vendor and deal discounts.
     * 
     * @param {Product} product - The product entity containing base price, discounts, and deal info.
     * 
     * @returns {Promise<{ finalPrice: number; vendorDiscount: number; dealDiscount: number }>} 
     *          An object with the final price after discounts, vendor discount percentage, and deal discount percentage.
     * 
     * @access Internal helper method
     */
    async calculateProductPrice(
        product: Product
    ): Promise<{ finalPrice: number; vendorDiscount: number; dealDiscount: number }> {
        // Extract vendor discount (defaults to 0 if not set)
        const vendorDiscount = product.discount || 0;

        // Initialize deal discount to zero
        let dealDiscount = 0;

        // Check if product has an active deal with enabled status and get its discount percentage
        if (product.dealId && product.deal && product.deal.status === DealStatus.ENABLED) {
            dealDiscount = product.deal.discountPercentage;
        }

        // Sum total discount percentage from vendor and deal
        const finalDiscount = vendorDiscount + dealDiscount;

        // Calculate final price after applying the total discount percentage
        const finalPrice = product.basePrice - (product.basePrice * finalDiscount / 100);

        return { finalPrice, vendorDiscount, dealDiscount };
    }

}