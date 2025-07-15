import { Request, Response } from 'express';
import { SubcategoryService } from '../service/subcategory.service';
import { ICreateSubcategoryRequest, IUpdateSubcategoryRequest, ISubcategoryIdParams } from '../interface/subcategory.interface';
import { AuthRequest } from '../middlewares/auth.middleware';
import { createSubCategorySchema, updateSubcategorySchema } from '../utils/zod_validations/subcategory.zod';
import { APIError } from '../utils/ApiError.utils';

/**
 * @class SubcategoryController
 * @description Handles HTTP requests related to subcategory management.
 * Provides endpoints for creating, retrieving, updating, and deleting subcategories.
 * Includes image handling and access control via authenticated routes.
 */
export class SubcategoryController {
    private subcategoryService: SubcategoryService;

    /**
     * @constructor
     * @description Initializes a new instance of SubcategoryController with SubcategoryService dependency.
     */
    constructor() {
        this.subcategoryService = new SubcategoryService();
    }

    /**
     * @method createSubcategory
     * @route POST /categories/:categoryId/subcategories
     * @description Creates a new subcategory under a given category. Accepts optional image upload. 
     * Validates input data and checks for duplicate subcategory names.
     * @param {AuthRequest<{ categoryId: number }, {}, ICreateSubcategoryRequest>} req - Authenticated request with category ID and subcategory data.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with created subcategory or appropriate error message.
     * @access Authenticated
     */
    async createSubcategory(req: AuthRequest<{ categoryId: number }, {}, ICreateSubcategoryRequest>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema
            const parsed = createSubCategorySchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Verify user authentication
            const user = req.user;
            if (!user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            // Validate category ID from route parameters
            const categoryId = Number(req.params.categoryId);
            if (isNaN(categoryId)) {
                res.status(400).json({ success: false, message: 'Invalid category ID' });
                return;
            }

            // Extract uploaded image file (optional)
            const file = req.file as Express.Multer.File | undefined;

            const { name } = req.body;

            // Check if subcategory with same name already exists
            const doesExists = await this.subcategoryService.getSubcategoryByName(name);

            if (doesExists) {
                throw new APIError(409, `Subcategory with name ${name} already exist`)
            }

            // Create subcategory with validated data and user authorization
            const subcategory = await this.subcategoryService.createSubcategory(parsed.data, categoryId, user.id, file);
            res.status(201).json({ success: true, data: subcategory });
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
     * @method getSubcategories
     * @route GET /categories/:categoryId/subcategories
     * @description Retrieves all subcategories for a specific category by its ID.
     * @param {Request<{ categoryId: number }>} req - Request with category ID in URL parameters.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with an array of subcategories or error message.
     * @access Public
     */
    async getSubcategories(req: Request<{ categoryId: number }>, res: Response): Promise<void> {
        try {
            // Validate category ID from route parameters
            const categoryId = req.params.categoryId;
            if (isNaN(categoryId)) {
                res.status(400).json({ success: false, message: 'Invalid category ID' });
                return;
            }

            // Fetch all subcategories for the specified category
            const subcategories = await this.subcategoryService.getSubcategories(categoryId);
            res.status(200).json({ success: true, data: subcategories });
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
     * @method getSubcategoryById
     * @route GET /categories/:categoryId/subcategories/:id
     * @description Retrieves a single subcategory using its ID and parent category ID.
     * @param {Request<ISubcategoryIdParams>} req - Request containing subcategory and category IDs.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with the subcategory data or 404 if not found.
     * @access Public
     */
    async getSubcategoryById(req: Request<ISubcategoryIdParams>, res: Response): Promise<void> {
        try {
            // Extract and validate subcategory and category IDs from route parameters
            const { id, categoryId } = req.params;
            if (isNaN(id) || isNaN(categoryId)) {
                res.status(400).json({ success: false, message: 'Invalid subcategory or category ID' });
                return;
            }

            // Fetch specific subcategory by ID and category
            const subcategory = await this.subcategoryService.getSubcategoryById(id, categoryId);

            // Return 404 if subcategory doesn't exist
            if (!subcategory) {
                res.status(404).json({ success: false, message: 'Subcategory not found' });
                return;
            }

            res.status(200).json({ success: true, data: subcategory });
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
     * @method updateSubcategory
     * @route PUT /categories/:categoryId/subcategories/:id
     * @description Updates subcategory details including optional image. Validates input and ensures user authorization.
     * @param {AuthRequest<ISubcategoryIdParams, {}, IUpdateSubcategoryRequest>} req - Authenticated request with subcategory/category IDs and updated data.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with updated subcategory or error.
     * @access Authenticated
     */
    async updateSubcategory(req: AuthRequest<ISubcategoryIdParams, {}, IUpdateSubcategoryRequest>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema
            const parsed = updateSubcategorySchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Verify user authentication
            const user = req.user;
            if (!user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            // Extract and validate subcategory and category IDs from route parameters
            const { id, categoryId } = req.params;
            const subcategoryId = Number(id);
            const catId = Number(categoryId);
            if (isNaN(subcategoryId) || isNaN(catId)) {
                res.status(400).json({ success: false, message: 'Invalid subcategory or category ID' });
                return;
            }

            // Extract uploaded image file (optional)
            const file = req.file as Express.Multer.File | undefined;

            // Update subcategory with validated data and user ownership check
            const subcategory = await this.subcategoryService.updateSubcategory(subcategoryId, parsed.data, catId, user.id, file);

            res.status(200).json({ success: true, data: subcategory });
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
     * @method deleteSubcategory
     * @route DELETE /categories/:categoryId/subcategories/:id
     * @description Deletes a specific subcategory by ID and category ID. Checks user authorization.
     * @param {AuthRequest<ISubcategoryIdParams>} req - Authenticated request with subcategory and category IDs.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Responds with success message or error.
     * @access Authenticated
     */
    async deleteSubcategory(req: AuthRequest<ISubcategoryIdParams>, res: Response): Promise<void> {
        try {
            // Verify user authentication
            const user = req.user;
            if (!user) {
                res.status(401).json({ success: false, message: 'Unauthorized' });
                return;
            }

            // Extract and validate subcategory and category IDs from route parameters
            const { id, categoryId } = req.params;
            const subcategoryId = Number(id);
            const catId = Number(categoryId);
            if (isNaN(subcategoryId) || isNaN(catId)) {
                res.status(400).json({ success: false, message: 'Invalid subcategory or category ID' });
                return;
            }

            // Delete subcategory with user ownership verification
            await this.subcategoryService.deleteSubcategory(subcategoryId, catId, user.id);
            res.status(200).json({ success: true, message: 'Subcategory deleted' });
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