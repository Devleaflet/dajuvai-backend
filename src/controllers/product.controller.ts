import { Request, Response } from 'express';
import { ICreateProductRequest, IProductIdParams, IProductImageParams, IUpdateProductRequest, IVendorProductQueryParams } from '../interface/product.interface';
import { AuthRequest, CombinedAuthRequest, VendorAuthRequest } from '../middlewares/auth.middleware';
import { AdminProductQueryInput, ProductQueryInput } from '../utils/zod_validations/product.zod';
import { ProductService } from '../service/product.service';
import { APIError } from '../utils/ApiError.utils';

/**
 * @class ProductController
 * @description Handles product-related operations for public users, vendors, and admins.
 */
export class ProductController {
    private productService: ProductService;

    /**
     * @constructor
     * @description Instantiates ProductService for business logic related to products.
     */
    constructor() {
        this.productService = new ProductService();
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
     * @route POST /products/:categoryId/:subcategoryId
     * @description Creates a new product for authenticated vendors. Handles file uploads and price calculations.
     * @param {CombinedAuthRequest<{ subcategoryId: string; categoryId: string }, {}, ICreateProductRequest, {}>} req - HTTP request containing vendor auth, product data, and uploaded files.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with created product data including calculated pricing info.
     * @access Vendor
     */
    async createProduct(
        req: CombinedAuthRequest<{ subcategoryId: string; categoryId: string }, {}, ICreateProductRequest, {}>,
        res: Response
    ): Promise<void> {
        try {
            // Extract uploaded files from multer middleware
            const files = req.files as Express.Multer.File[];
            console.log(files)

            // Parse category and subcategory IDs from route parameters
            const subcategoryId = Number(req.params.subcategoryId);
            const categoryId = Number(req.params.categoryId);

            let product;

            // Check if request is from vendor (vendor-specific product creation)
            if (req.vendor) {
                const vendorId = req.vendor.id;

                console.log("vendor product creation")
                console.log(vendorId);

                // Create product through vendor service method
                product = await this.productService.createVendorProduct(
                    req.body,
                    subcategoryId,
                    categoryId,
                    vendorId,
                    files || []
                );
            } else {
                // Unauthorized if no vendor info present
                throw new APIError(403, 'Unauthorized');
            }

            // Calculate pricing information for the created product
            const priceInfo = await this.productService.calculateProductPrice(product);
            res.status(201).json({ success: true, data: { ...product, ...priceInfo } });

        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors for debugging
                console.error('createProduct error:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        }
    }

    /**
     * @method createVendorProduct
     * @route POST /vendor/products/:categoryId/:subcategoryId
     * @description Creates a product by a vendor, including handling file uploads and price info.
     * @param {VendorAuthRequest} req - Authenticated vendor request including category IDs and product data.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with created product and price info.
     * @access Vendor
     */
    async createVendorProduct(req: VendorAuthRequest<{ subcategoryId: string; categoryId: string }, {}, ICreateProductRequest, {}>, res: Response) {
        try {
            // Extract uploaded files (optional)
            const files = req.files as Express.Multer.File[] | undefined;

            // Get vendor ID from authenticated request
            const vendorId = req.vendor.id;

            // Parse route parameters
            const subcategoryId = Number(req.params.subcategoryId);
            const categoryId = Number(req.params.categoryId);

            // Create product through service layer
            const product = await this.productService.createVendorProduct(
                req.body,
                subcategoryId,
                categoryId,
                vendorId,
                files || []
            );

            // Calculate and include price information
            const priceInfo = await this.productService.calculateProductPrice(product);
            res.status(201).json({ success: true, data: { ...product, ...priceInfo } });
        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors for debugging
                console.error('createProduct error:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        }
    }

    /**
     * @method getProducts
     * @route GET /products/:categoryId/:subcategoryId
     * @description Fetches products filtered by category and subcategory, with optional query filters.
     * @param {Request} req - Request with route and query parameters for filtering products.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with a list of matching products.
     * @access Public
     */
    async getProducts(req: Request<{ categoryId: string, subcategoryId: string }, {}, {}, ProductQueryInput>, res: Response) {
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



    /**
     * @method getAllProducts
     * @route GET /products
     * @description Retrieves all products across all categories with optional filtering and sorting.
     * @param {Request} req - Request with query parameters for filtering.
     * @param {Response} res - Response object.
     * @returns {Promise<void>} Responds with a filtered list of all products.
     * @access Public
     */
    async getAllProducts(req: Request<{}, {}, {}, ProductQueryInput>, res: Response) {
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



    /**
     * @method getProductById
     * @route GET /products/:id/:subcategoryId
     * @description Retrieves a product by product ID and subcategory ID.
     * @param {Request<IProductIdParams>} req - Request with product ID and subcategory ID.
     * @param {Response} res - Response object.
     * @returns {Promise<void>} Responds with the product data or 404 if not found.
     * @access Public
     */
    async getProductById(req: Request<IProductIdParams>, res: Response) {
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




    /**
     * @method getProductsByVendorId
     * @route GET /vendor/:vendorId/products
     * @description Retrieves paginated products associated with a specific vendor.
     * @param {Request} req - Request with vendor ID and pagination query parameters.
     * @param {Response} res - Response object.
     * @returns {Promise<void>} Responds with paginated products and total count.
     * @access Public
     */
    async getProductsByVendorId(
        req: Request<{ vendorId: string }, {}, {}, IVendorProductQueryParams>,
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



    /**
     * @method updateProduct
     * @route PUT /products/:id/:subcategoryId
     * @description Updates an existing product, including optional image updates via file upload.
     * @param {AuthRequest} req - Authenticated request containing product ID, updated data, and optional files.
     * @param {Response} res - Response object.
     * @returns {Promise<void>} Responds with the updated product data or error.
     * @access Authenticated
     */
    async updateProduct(req: CombinedAuthRequest<IProductIdParams, {}, IUpdateProductRequest>, res: Response) {
        try {
            // Extract product and subcategory IDs from route parameters
            const { id, subcategoryId } = req.params;

            // Extract uploaded files (optional)
            const files = req.files as Express.Multer.File[] | undefined;

            // Update product through service layer with user authorization
            const product = await this.productService.updateProduct(
                Number(id),
                req.body,
                Number(subcategoryId),
                req.vendor?.id,
                files || [],
                req.user!
            );

            // Return 404 if product doesn't exist
            if (!product) {
                return res.status(404).json({ success: false, message: 'Product not found' });
            }

            res.status(200).json({ success: true, data: product });
        } catch (error) {
            // Handle API errors with specific status codes
            if (error instanceof APIError) {
                console.log(error);
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors for debugging
                console.error('updateProduct error:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error in controller' });
            }
        }
    }




    /**
     * @method deleteProduct
     * @route DELETE /products/:id/:subcategoryId
     * @description Deletes a product by ID and subcategory, accessible only by authorized users.
     * @param {AuthRequest} req - Authenticated request with product ID and subcategory ID.
     * @param {Response} res - Response object.
     * @returns {Promise<void>} Responds with 204 No Content if successful.
     * @access Authenticated
     */
    async deleteProduct(req: AuthRequest<IProductIdParams>, res: Response) {
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
    async deleteProductImage(req: CombinedAuthRequest<IProductImageParams, {}, { imageUrl: string }>, res: Response): Promise<void> {
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
    async getAdminProducts(req: AuthRequest<{}, {}, {}, AdminProductQueryInput>, res: Response) {
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
}