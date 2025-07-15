import { Request, Response } from 'express';
import { ICreateCategoryRequest, IUpdateCategoryRequest, ICategoryIdParams } from '../interface/category.interface';
import { createCategorySchema, updateCategorySchema } from '../utils/zod_validations/category.zod';
import { CategoryService } from '../service/category.service';
import { AuthRequest } from '../middlewares/auth.middleware';
import { APIError } from '../utils/ApiError.utils';

/**
 * @class CategoryController
 * @description Controller for handling category-related HTTP requests.
 * Manages creation, retrieval, updating, searching, and deletion of categories.
 */
export class CategoryController {
    private categoryService: CategoryService;

    /**
     * @constructor
     * @description Initializes the controller with a CategoryService instance.
     */
    constructor() {
        this.categoryService = new CategoryService();
    }

    /**
     * @method createCategory
     * @route POST /api/categories
     * @description Creates a new category with an optional image for the authenticated admin user.
     * @param {AuthRequest<{}, {}, ICreateCategoryRequest>} req - Request with category data and optional image file
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Sends created category or validation error
     * @access Admin and staff 
     */
    async createCategory(req: AuthRequest<{}, {}, ICreateCategoryRequest>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema
            const parsed = createCategorySchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Ensure user is authenticated
            const user = req.user;
            if (!user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            // Get uploaded image file 
            const file = req.file as Express.Multer.File | undefined;

            const { name } = req.body;

            // Check for existing category with the same name
            const doesExists = await this.categoryService.getCategoryByName(name);

            if (doesExists) {
                throw new APIError(409, `category with the name ${name} already exists`);
            }

            // Create category via service
            const category = await this.categoryService.createCategory(parsed.data, user.id, file);
            // Log created category for debugging
            console.log(category);
            res.status(201).json({ success: true, data: category });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Create category error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @method searchCategories
     * @route GET /api/categories/search
     * @description Searches for categories by name for the authenticated user.
     * @param {AuthRequest<{}, {}, {}, { name: string }>} req - Authenticated request with search query
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with matching categories
     * @access admin and staff
     */
    async searchCategories(req: AuthRequest<{}, {}, {}, { name: string }>, res: Response): Promise<void> {
        try {
            // Validate authenticated user
            const user = req.user;
            if (!user) {
                throw new APIError(401, "Unauthorized");
            }

            // Validate search query
            const name = req.query.name?.trim();
            if (!name) {
                throw new APIError(400, "search querry is required");
            }

            // Search categories via service
            const category = await this.categoryService.searchCategoryByName(name);
            // Send success response
            res.status(200).json({
                success: true,
                data: category
            });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Search categories error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
    * @method getCategories
    * @route GET /api/categories
    * @description Retrieves all categories in the system.
    * @param {Request} req - Express request object
    * @param {Response} res - Express response object
    * @returns {Promise<void>} Responds with array of categories
    * @access Public
    */
    async getCategories(req: Request, res: Response): Promise<void> {
        try {
            // Fetch all categories using service
            const categories = await this.categoryService.getCategories();
            // Send success response
            res.status(200).json({ success: true, data: categories });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Get categories error:', error);
                res.status(500).json({ success: false, message: error.message });
            }
        }
    }

    /**
     * @method getCategoryById
     * @route GET /api/categories/:id
     * @description Retrieves a specific category by its ID.
     * @param {Request<ICategoryIdParams>} req - Request with category ID
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with category or 404 if not found
     * @access Public
     */
    async getCategoryById(req: Request<ICategoryIdParams>, res: Response): Promise<void> {
        try {
            // Validate category ID
            const id = req.params.id;
            if (isNaN(id)) {
                res.status(400).json({ success: false, message: 'Invalid category ID' });
                return;
            }

            // Fetch category by ID
            const category = await this.categoryService.getCategoryById(id);
            if (!category) {
                res.status(404).json({ success: false, message: 'Category not found' });
                return;
            }

            // Send success response
            res.status(200).json({ success: true, data: category });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Get category by ID error:', error);
                res.status(500).json({ success: false, message: error.message });
            }
        }
    }

    /**
     * @method updateCategory
     * @route PUT /api/categories/:id
     * @description Updates a specific category by ID, with optional image update.
     * @param {AuthRequest<ICategoryIdParams, {}, IUpdateCategoryRequest>} req - Authenticated request with ID, body, and optional file
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with updated category or 404
     * @access Admin ans staff 
     */
    async updateCategory(req: AuthRequest<ICategoryIdParams, {}, IUpdateCategoryRequest>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema
            const parsed = updateCategorySchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Ensure user is authenticated
            const user = req.user;
            if (!user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            // Validate category ID
            const id = Number(req.params.id);
            if (isNaN(id)) {
                res.status(400).json({ success: false, message: 'Invalid category ID' });
                return;
            }

            // Get uploaded image file (if any)
            const file = req.file as Express.Multer.File | undefined;

            // Verify category exists
            const exists = await this.categoryService.getCategoryById(req.params.id);

            if (!exists) {
                throw new APIError(409, "category doesnot exists");
            }

            // Update category with validated data, ensuring user ownership
            const category = await this.categoryService.updateCategory(id, parsed.data, user.id, file);
            if (!category) {
                res.status(404).json({ success: false, message: 'Category not found' });
                return;
            }

            // Send success response
            res.status(200).json({ success: true, data: category });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Update category error:', error);
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @method deleteCategory
     * @route DELETE /api/categories/:id
     * @description Deletes a category by ID for the authenticated admin.
     * @param {AuthRequest<ICategoryIdParams>} req - Authenticated request with ID param
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with success message or 404
     * @access Admin and staff
     */
    async deleteCategory(req: AuthRequest<ICategoryIdParams>, res: Response): Promise<void> {
        try {
            // Ensure user is authenticated
            const user = req.user;
            if (!user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            // Validate category ID
            const id = req.params.id;
            if (isNaN(id)) {
                res.status(400).json({ success: false, message: 'Invalid category ID' });
                return;
            }

            // Delete category, ensuring user ownership
            await this.categoryService.deleteCategory(id, user.id);
            // Send success response
            res.status(204).json({ success: true, message: 'Category deleted' });
        } catch (error) {
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Log unexpected errors
                console.error('Delete category error:', error);
                res.status(500).json({ success: false, message: error.message });
            }
        }
    }
}