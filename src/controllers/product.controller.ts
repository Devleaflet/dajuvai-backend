import { Request, Response } from 'express';
import { AuthRequest, CombinedAuthRequest, VendorAuthRequest } from '../middlewares/auth.middleware';
import { ProductInterface } from '../utils/zod_validations/product.zod';
import { ProductService } from '../service/product.service';
import { APIError } from '../utils/ApiError.utils';
import { IAdminProductQueryParams, IProductQueryParams } from '../interface/product.interface';
import { v2 as cloudinary } from 'cloudinary';
import { DataSource } from 'typeorm';
import { SubcategoryService } from '../service/subcategory.service';


/**
 * @class ProductController
 * @description Handles product-related operations for public users, vendors, and admins.
 */
export class ProductController {
    private productService: ProductService;
    private subcategoryService: SubcategoryService;

    /**
     * @constructor
     * @description Instantiates ProductService for business logic related to products.
     */
    constructor(dataSource: DataSource) {
        this.productService = new ProductService(dataSource);
        this.subcategoryService = new SubcategoryService();

        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });
    }

    /**
     * @method getProductDetailById
     * @route GET /products/:id
     * @description Retrieves detailed information for a specific product by its ID.
     * @param {Request<{ id: string }>} req - Express request with product ID in URL params.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with product details JSON or error.
     * @access Public
     */
    async getProductDetailById(req: Request<{ id: string }, {}, {}>, res: Response) {
        try {
            // Parse product ID from route parameters
            const productId = parseInt(req.params.id);

            // Fetch product details from service layer
            const product = await this.productService.getProductDetailsById(productId);

            // Send success response with product data
            res.status(200).json({
                success: true,
                product: product
            })

        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Handle unexpected errors with generic 500 response
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @method getAll
     * @route GET /admin/products/all
     * @description Retrieve all products with admin-level access.
     * @param {Request} req - Express request object.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with array of all products.
     * @access Admin and staff
     */
    async getAll(req: Request, res: Response): Promise<void> {
        try {
            // Fetch all products from service layer
            const products = await this.productService.getAlllProducts();
            res.status(200).json({ success: true, data: products });
        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Handle unexpected errors with generic 500 response
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }




    /**
     * @method createProduct
     * @route POST /categories/:categoryId/subcategories/:subcategoryId/products
     * @description Creates a new product with or without variants.
     * 
     * For variant products:
     * - Set hasVariants: true
     * - Provide variants array with sku, price, stock, status
     * - Upload variant images as 'variantImages' field (one image per variant, in order)
     * 
     * For non-variant products:
     * - Set hasVariants: false
     * - Provide basePrice and stock
     * - Upload product images as 'productImages' field
     * 
     * @param {VendorAuthRequest} req - Authenticated vendor request with product data and files
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with created product data
     * @access Vendor
     */
    async createProduct(
        req: VendorAuthRequest<{ subcategoryId: string; categoryId: string }, {}, ProductInterface, {}>,
        res: Response
    ): Promise<void> {
        try {
            const data: ProductInterface = req.body;
            const files = req.files as Record<string, Express.Multer.File[]>;
            const categoryId = Number(req.params.categoryId);
            const subcategoryId = Number(req.params.subcategoryId);

            const rawHasVariants = req.body.hasVariants;
            const hasVariants = String(rawHasVariants).toLowerCase() === "true";

            console.log("Stock_________________________________________________")
            console.log(data.stock);

            if (!data.description) {
                throw new APIError(400, "Description is required")
            }

            // Handle variants parsing - it might come as a JSON string from form data
            if (data.hasVariants && data.variants) {
                // If variants is a string, try to parse it as JSON
                if (typeof data.variants === 'string') {
                    try {
                        data.variants = JSON.parse(data.variants);
                    } catch (parseError) {
                        console.error('Failed to parse variants JSON:', parseError);
                        throw new APIError(400, 'Invalid variants JSON format');
                    }
                }

                // Validate that variants is now an array
                if (!Array.isArray(data.variants)) {
                    throw new APIError(400, 'Variants must be an array');
                }
            }

            // Debug logging
            console.log('Creating product with data:', {
                hasVariants: data.hasVariants,
                variantsCount: data.variants?.length || 0,
                variantsType: typeof data.variants,
                variantsData: data.variants,
                filesReceived: files ? files.length : 0,
                // fileFieldNames: files ? files.map(f => f.fieldname) : []
            });

            const savedProduct = await this.productService.createProduct(
                data,
                files,
                categoryId,
                subcategoryId,
                Number(req.vendor.id),
                hasVariants
            );

            res.status(201).json({
                success: true,
                message: 'Product created successfully',
                data: savedProduct,
            });

        } catch (error) {
            if (error instanceof APIError) {
                console.log('API Error in createProduct:', error.message);
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                console.error('createProduct error:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        }
    }

    async updateProduct(
        req: VendorAuthRequest<{ id: string; subcategoryId: string; categoryId: string }, {}, Partial<ProductInterface>, {}>,
        res: Response
    ): Promise<void> {
        try {
            const files = req.files as Record<string, Express.Multer.File[]>;
            const data: Partial<ProductInterface> = req.body;
            const productId = Number(req.params.id);
            const categoryId = Number(req.params.categoryId);
            const subcategoryId = Number(req.params.subcategoryId);

            // check if product exists
            const product = await this.productService.getProductById(productId, subcategoryId);
            if (!product) {
                throw new APIError(404, 'Product not found');
            }

            // check if the vendor is the owner of the product
            if (product.vendorId !== req.vendor?.id) {
                throw new APIError(403, 'You are not authorized to update this product');
            }

            // check if suncategory exists
            const subcategory = await this.subcategoryService.getSubcategoryById(subcategoryId, categoryId);
            if (!subcategory) {
                throw new APIError(404, 'Subcategory not found');
            }

            // Handle variants parsing if in string conver them in json format 
            if (data.variants) {
                if (typeof data.variants === 'string') {
                    try {
                        data.variants = JSON.parse(data.variants);
                    } catch (parseError) {
                        console.error('Failed to parse variants JSON:', parseError);
                        throw new APIError(400, 'Invalid variants JSON format');
                    }
                }
                if (!Array.isArray(data.variants)) {
                    throw new APIError(400, 'Variants must be an array');
                }
            }


            console.log('Updating product with data:', {
                productId,
                hasVariants: data.hasVariants,
                variantsCount: data.variants?.length || 0,
                variantsType: typeof data.variants,
                variantsData: data.variants,
                filesReceived: files ? Object.keys(files).map(key => ({ field: key, count: files[key].length })) : [],
            });

            // Get vendor ID by product ID
            const vendorId = await this.productService.getVendorIdByProductId(productId);

            const updatedProduct = await this.productService.updateProduct(
                req.vendor ? req.vendor.id : vendorId,
                req.vendor ? false : true, // Is admin updating the product?
                productId,
                data,
                files,
                categoryId,
                subcategoryId
            );

            res.status(200).json({
                success: true,
                message: 'Product updated successfully',
                data: updatedProduct,
            });
        } catch (error) {
            if (error instanceof APIError) {
                console.log('API Error in updateProduct:', error.message);
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                console.error('updateProduct error:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        }
    }


    async getProducts(req: Request<{ categoryId: string, subcategoryId: string }, {}, {}, IProductQueryParams>, res: Response) {
        try {
            console.log('Route params:', req.params);
            console.log('Query params:', req.query);

            // Merge route params with query params for comprehensive filtering
            const queryParams = {
                ...req.query,
                categoryId: req.params.categoryId ? Number(req.params.categoryId) : req.query.categoryId,
                subcategoryId: req.params.subcategoryId ? Number(req.params.subcategoryId) : req.query.subcategoryId
            };

            // Filter products based on merged parameters
            const products = await this.productService.filterProducts(queryParams);
            res.status(200).json({ success: true, data: products });
        } catch (error) {
            console.error('getProducts error details:', error);

            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Include error details in development environment
                res.status(500).json({
                    success: false,
                    message: 'Internal Server Error',
                    error: process.env.NODE_ENV === 'development' ? error.message : undefined
                });
            }
        }
    }


    async getAllProducts(req: Request<{}, {}, {}, {}>, res: Response) {
        try {
            console.log('Query params:', req.query);

            // Use query parameters directly for filtering
            const queryParams = { ...req.query };

            // Filter products through service layer
            const products = await this.productService.filterProducts(queryParams);

            return res.status(200).json({
                success: true,
                message: "All products retrieved succesfully",
                data: products
            })
        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors for debugging
                console.error('getProducts error:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        }
    }


    async getProductById(req: Request<{ id: string, subcategoryId: string }>, res: Response) {
        try {
            // Extract IDs from route parameters
            const { id, subcategoryId } = req.params;

            // Fetch product by ID and subcategory
            const product = await this.productService.getProductById(Number(id), Number(subcategoryId));

            // Return 404 if product doesn't exist
            if (!product) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            res.status(200).json({
                success: true,
                data: product,
            });
        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors for debugging
                console.error('getProductById error:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        }
    }



    async getProductsByVendorId(
        req: Request<{ vendorId: string }, {}, {}, { page: string, limit: string }>,
        res: Response
    ) {
        try {
            // Extract vendor ID from route parameters
            const { vendorId } = req.params;

            // Set default pagination values if not provided
            const { page = 1, limit = 10 } = req.query;

            // Fetch paginated products for specific vendor
            const { products, total } = await this.productService.getProductsByVendorId(
                Number(vendorId),
                Number(page),
                Number(limit)
            );

            res.status(200).json({ success: true, data: { products, total } });
        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors for debugging
                console.error('getProductsByVendorId error:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        }
    }




    async deleteProduct(req: AuthRequest<{ id: string, subcategoryId: string }>, res: Response) {
        try {
            // Extract product and subcategory IDs from route parameters
            const { id, subcategoryId } = req.params;

            // Delete product with user authorization check
            await this.productService.deleteProduct(Number(id), Number(subcategoryId), req.user!.id);

            // Return 204 No Content on successful deletion
            res.status(204).json({ success: true });
        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors for debugging
                console.error('deleteProduct error:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        }
    }



    /**
     * @method deleteProductImage
     * @route DELETE /products/:id/:subcategoryId/image
     * @description Deletes a specific image from a product, requires valid image URL and authorization.
     * @param {AuthRequest} req - Authenticated request containing product ID, subcategory ID, and image URL.
     * @param {Response} res - Response object.
     * @returns {Promise<void>} Responds with updated product or error.
     * @access Authenticated
     */
    async deleteProductImage(req: CombinedAuthRequest<{ id: string, subcategoryId: string }, {}, { imageUrl: string }>, res: Response): Promise<void> {
        try {
            // Extract product and subcategory IDs from route parameters
            const { id, subcategoryId } = req.params;

            // Extract image URL from request body
            const { imageUrl } = req.body;

            // Validate that image URL is provided
            if (!imageUrl) {
                throw new APIError(400, "Image URL is required")
            }

            const userId = req.user?.id || req.vendor?.id;

            // Delete product image through service layer with authorization
            const product = await this.productService.deleteProductImage(
                Number(id),
                Number(subcategoryId),
                userId,
                imageUrl
            );

            // Return 404 if product or image not found
            if (!product) {
                throw new APIError(404, "Product or image not found")
            }

            res.status(200).json({ success: true, data: product });
        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors for debugging
                console.error('deleteProductImage error:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        }
    }



    /**
     * @method getAdminProducts
     * @route GET /admin/products
     * @description Fetches paginated products for admin dashboard with advanced filtering options.
     * @param {AuthRequest} req - Authenticated request with admin query filters.
     * @param {Response} res - Response object.
     * @returns {Promise<void>} Responds with filtered paginated products.
     * @access Admin and staff
     */
    async getAdminProducts(req: AuthRequest<{}, {}, {}, IAdminProductQueryParams>, res: Response) {
        try {
            // Fetch paginated products with admin-specific filtering
            const { products, total } = await this.productService.getAdminProducts(req.query);
            res.status(200).json({ success: true, data: { products, total } });
        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Handle unexpected errors with generic 500 response
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }



    async deleteProductById(req: Request<{ id: string }>, res: Response) {
        try {
            const id = Number(req.params.id);

            console.log(id);

            const deleteProduct = await this.productService.deleteProductById(id);

            res.status(200).json({
                success: true,
                msg: "Product deleted successfully"
            })

        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, msg: error.message })
            } else {
                res.status(500).json({ success: false, msg: "Internal server error" })
            }
        }
    }


    async getProductsTest(req: Request, res: Response) {
        try {
            const products = await this.productService.getProducts();
            res.status(200).json({ success: true, data: products });
        } catch (error) {
            res.status(500).json({ success: false, message: 'Internal Server Error' });
        }
    }
}