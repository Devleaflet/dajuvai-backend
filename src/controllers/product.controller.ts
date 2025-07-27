import { Request, Response } from 'express';
import { AuthRequest, CombinedAuthRequest, VendorAuthRequest } from '../middlewares/auth.middleware';
import { ProductInterface, ProductUpdateType } from '../utils/zod_validations/product.zod';
import { ProductService } from '../service/product.service';
import { APIError } from '../utils/ApiError.utils';
import { IAdminProductQueryParams, IProductQueryParams } from '../interface/product.interface';
import { v2 as cloudinary } from 'cloudinary';


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




    async createProduct(
        req: VendorAuthRequest<{ subcategoryId: string; categoryId: string }, {}, ProductInterface, {}>,
        res: Response
    ): Promise<void> {
        try {
            const data: ProductInterface = req.body;
            const files = req.files as Express.Multer.File[];
            const categoryId = Number(req.params.categoryId);
            const subcategoryId = Number(req.params.subcategoryId);

            const savedProduct = await this.productService.createProduct(
                data,
                files,
                categoryId,
                subcategoryId,
                Number(req.vendor.id),
            );

            res.status(201).json({
                success: true,
                message: 'Product created successfully',
                data: savedProduct,
            });

        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                console.error('createProduct error:', error);
                res.status(500).json({ success: false, message: 'Internal Server Error' });
            }
        }
    }


    async updateProduct(
        req: VendorAuthRequest<{ productId: string; subcategoryId: string; categoryId: string }, {}, Partial<ProductInterface>, {}>,
        res: Response
    ): Promise<void> {
        try {
            const files = req.files as Express.Multer.File[];
            const data: Partial<ProductInterface> = req.body;
            const productId = Number(req.params.productId);
            const categoryId = Number(req.params.categoryId);
            const subcategoryId = Number(req.params.subcategoryId);

            // get veendor id by product id 
            const vendorId = await this.productService.getVendorIdByProductId(productId);

            const updatedProduct = await this.productService.updateProduct(
                req.vendor ? req.vendor.id : vendorId,
                req.vendor ? false : true, // is admin trying to update the product or not 
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
}