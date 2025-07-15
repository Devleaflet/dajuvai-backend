import { Router } from 'express';
import { ProductController } from '../controllers/product.controller';
import { authMiddleware, combinedAuthMiddleware, isAdmin, isAdminOrStaff, isAdminOrVendor, isVendor, isVendorAccountOwnerOrAdminOrStaff, requireAdminStaffOrVendor, restrictToVendorOrAdmin, validateZod, vendorAuthMiddleware } from '../middlewares/auth.middleware';
import { multerOptions } from '../config/multer.config';
import multer from 'multer';
import { createProductSchema, updateProductSchema, productQuerySchema } from '../utils/zod_validations/product.zod';
import { createCategorySchema, updateCategorySchema } from '../utils/zod_validations/category.zod';
import { SubcategoryController } from '../controllers/subcategory.controller';
import { CategoryController } from '../controllers/category.controller';
import { createSubCategorySchema, updateSubcategorySchema } from '../utils/zod_validations/subcategory.zod';

const router = Router();
const productController = new ProductController();
const categoryController = new CategoryController();
const subcategoryController = new SubcategoryController();
const upload = multer(multerOptions);



/**
 * @swagger
 * /api/categories:
 *   post:
 *     summary: Create a new category
 *     description: Allows an authenticated admin to create a new category with an optional image
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: The name of the category
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Optional image file for the category
 *           example:
 *             name: "Adventure"
 *             image: file.jpg
 *     responses:
 *       201:
 *         description: Category created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     name:
 *                       type: string
 *                     image:
 *                       type: string
 *                       nullable: true
 *                     createdBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: number
 *                         username:
 *                           type: string
 *             example:
 *               success: true
 *               data:
 *                 id: 3
 *                 name: "Adventure"
 *                 image: "https://res.cloudinary.com/.../image.jpg"
 *                 createdBy:
 *                   id: 1
 *                   username: "adminuser"
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized (user not authenticated)
 *       403:
 *         description: Forbidden (user not an admin)
 *       500:
 *         description: Internal server error
 */
router.post('/', authMiddleware, isAdminOrStaff, upload.single('image'), validateZod(createCategorySchema), categoryController.createCategory.bind(categoryController));


/**
 * @swagger
 * /api/categories:
 *   get:
 *     summary: Get all categories
 *     description: Retrieves a list of all categories with related subcategories and creator info
 *     tags: [Category]
 *     responses:
 *       200:
 *         description: List of categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                         description: Category ID
 *                       name:
 *                         type: string
 *                         description: Category name
 *                       createdBy:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: number
 *                           username:
 *                             type: string
 *                       subcategories:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: number
 *                             name:
 *                               type: string
 *             example:
 *               success: true
 *               data:
 *                 - id: 1
 *                   name: "Adventure"
 *                   createdBy:
 *                     id: 1
 *                     username: "adminuser"
 *                   subcategories:
 *                     - id: 10
 *                       name: "Hiking"
 *                     - id: 11
 *                       name: "Skydiving"
 *       500:
 *         description: Internal server error
 */

router.get('/', categoryController.getCategories.bind(categoryController));

/**
 * @swagger
 * /api/categories/{id}:
 *   get:
 *     summary: Get category by ID
 *     description: Retrieves a single category by its ID, including subcategories and creator info
 *     tags: [Category]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the category to retrieve
 *     responses:
 *       200:
 *         description: Category retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                       description: Category ID
 *                     name:
 *                       type: string
 *                       description: Category name
 *                     createdBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: number
 *                         username:
 *                           type: string
 *                     subcategories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: number
 *                           name:
 *                             type: string
 *             example:
 *               success: true
 *               data:
 *                 id: 1
 *                 name: "Adventure"
 *                 createdBy:
 *                   id: 1
 *                   username: "adminuser"
 *                 subcategories:
 *                   - id: 10
 *                     name: "Hiking"
 *                   - id: 11
 *                     name: "Skydiving"
 *       400:
 *         description: Invalid category ID
 *       404:
 *         description: Category not found
 *       500:
 *         description: Internal server error
 */

router.get('/:id', categoryController.getCategoryById.bind(categoryController));

/**
 * @swagger
 * /api/categories/{id}:
 *   put:
 *     summary: Update a category
 *     description: Allows an authenticated admin to update the name and/or image of an existing category
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the category to update
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new name for the category
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Optional new image file to upload
 *           example:
 *             name: "Eco Tours"
 *             image: file.jpg
 *     responses:
 *       200:
 *         description: Category updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     name:
 *                       type: string
 *                     image:
 *                       type: string
 *                       nullable: true
 *                     createdBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: number
 *                         username:
 *                           type: string
 *                     subcategories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: number
 *                           name:
 *                             type: string
 *           example:
 *             success: true
 *             data:
 *               id: 1
 *               name: "Eco Tours"
 *               image: "https://res.cloudinary.com/.../new_image.jpg"
 *               createdBy:
 *                 id: 1
 *                 username: "adminuser"
 *               subcategories:
 *                 - id: 12
 *                   name: "Forest Trails"
 *       400:
 *         description: Invalid input data or category ID
 *       401:
 *         description: Unauthorized (user not authenticated)
 *       403:
 *         description: Forbidden (user not an admin)
 *       404:
 *         description: Category not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id', authMiddleware, isAdminOrStaff, upload.single('image'), validateZod(updateCategorySchema), categoryController.updateCategory.bind(categoryController));

/**
 * @swagger
 * /api/categories/search/name:
 *   get:
 *     summary: Search categories by name
 *     description: Retrieves categories matching the provided name query for authenticated admin users
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: name
 *         required: true
 *         schema:
 *           type: string
 *         description: The name or partial name to search for categories
 *     responses:
 *       200:
 *         description: Successfully retrieved matching categories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: Electronics
 *                       image:
 *                         type: string
 *                         nullable: true
 *                         example: https://res.cloudinary.com/example/image.jpg
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-06-12T11:31:00.000Z
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: 2025-06-12T11:31:00.000Z
 *                       createdBy:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: number
 *                             example: 1
 *                           username:
 *                             type: string
 *                             example: admin
 *                           role:
 *                             type: string
 *                             example: ADMIN
 *                       subcategories:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: number
 *                               example: 1
 *                             name:
 *                               type: string
 *                               example: Smartphones
 *             example:
 *               success: true
 *               data:
 *                 - id: 1
 *                   name: Electronics
 *                   image: https://res.cloudinary.com/example/image.jpg
 *                   createdAt: 2025-06-12T11:31:00.000Z
 *                   updatedAt: 2025-06-12T11:31:00.000Z
 *                   createdBy:
 *                     id: 1
 *                     username: admin
 *                     role: ADMIN
 *                   subcategories:
 *                     - id: 1
 *                       name: Smartphones
 *       400:
 *         description: Invalid or missing search query
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Search query is required
 *       401:
 *         description: Unauthorized access
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Unauthorized
 *       404:
 *         description: No categories found matching the search query
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: No categories found matching the search query
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: Internal server error
 */
router.get("/search/name", authMiddleware, isAdminOrStaff, categoryController.searchCategories.bind(categoryController));

/**
 * @swagger
 * /api/categories/{id}:
 *   delete:
 *     summary: Delete a category
 *     description: Allows an authenticated admin to delete a category by its ID
 *     tags: [Category]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the category to delete
 *     responses:
 *       204:
 *         description: Category deleted successfully (no content returned)
 *       400:
 *         description: Invalid category ID
 *       401:
 *         description: Unauthorized (user not authenticated)
 *       403:
 *         description: Forbidden (user not an admin)
 *       500:
 *         description: Internal server error
 */

router.delete('/:id', authMiddleware, isAdminOrStaff, categoryController.deleteCategory.bind(categoryController));

/**
 * @swagger
 * /api/categories/{categoryId}/subcategories:
 *   post:
 *     summary: Create a subcategory
 *     description: Allows an authenticated admin to create a new subcategory under a specific category with an optional image
 *     tags: [Subcategory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the parent category
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the subcategory
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Optional image file for the subcategory
 *           example:
 *             name: "Mountain Tours"
 *             image: file.jpg
 *     responses:
 *       201:
 *         description: Subcategory created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     name:
 *                       type: string
 *                     image:
 *                       type: string
 *                       nullable: true
 *                     category:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: number
 *                         name:
 *                           type: string
 *                     createdBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: number
 *                         username:
 *                           type: string
 *             example:
 *               success: true
 *               data:
 *                 id: 3
 *                 name: "Mountain Tours"
 *                 image: "https://res.cloudinary.com/.../mountain_tours.jpg"
 *                 category:
 *                   id: 1
 *                   name: "Adventure"
 *                 createdBy:
 *                   id: 1
 *                   username: "adminuser"
 *       400:
 *         description: Invalid input or category ID
 *       401:
 *         description: Unauthorized (user not authenticated)
 *       403:
 *         description: Forbidden (user not an admin)
 *       404:
 *         description: Category not found
 *       500:
 *         description: Internal server error
 */
router.post('/:categoryId/subcategories', authMiddleware, isAdminOrStaff, upload.single('image'), validateZod(createSubCategorySchema), subcategoryController.createSubcategory.bind(subcategoryController));

/**
 * @swagger
 * /api/categories/{categoryId}/subcategories:
 *   get:
 *     summary: Get subcategories by category
 *     description: Retrieves all subcategories that belong to a specific category
 *     tags: [Subcategory]
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the parent category
 *     responses:
 *       200:
 *         description: A list of subcategories
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                       name:
 *                         type: string
 *                       category:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: number
 *                           name:
 *                             type: string
 *                       createdBy:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: number
 *                           username:
 *                             type: string
 *             example:
 *               success: true
 *               data:
 *                 - id: 1
 *                   name: "Beach Tours"
 *                   category:
 *                     id: 2
 *                     name: "Leisure"
 *                   createdBy:
 *                     id: 1
 *                     username: "adminuser"
 *       400:
 *         description: Invalid category ID
 *       500:
 *         description: Internal server error
 */

router.get('/:categoryId/subcategories', subcategoryController.getSubcategories.bind(subcategoryController));

/**
 * @swagger
 * /api/categories/{categoryId}/subcategories/{id}:
 *   get:
 *     summary: Get a subcategory by ID within a category
 *     description: Retrieves a specific subcategory by its ID and its parent category ID
 *     tags: [Subcategory]
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the parent category
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the subcategory
 *     responses:
 *       200:
 *         description: Subcategory found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     name:
 *                       type: string
 *                     category:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: number
 *                         name:
 *                           type: string
 *                     createdBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: number
 *                         username:
 *                           type: string
 *             example:
 *               success: true
 *               data:
 *                 id: 5
 *                 name: "Luxury Villas"
 *                 category:
 *                   id: 3
 *                   name: "Accommodation"
 *                 createdBy:
 *                   id: 1
 *                   username: "adminuser"
 *       400:
 *         description: Invalid subcategory or category ID
 *       404:
 *         description: Subcategory not found
 *       500:
 *         description: Internal server error
 */

router.get('/:categoryId/subcategories/:id', subcategoryController.getSubcategoryById.bind(subcategoryController));

/**
 * @swagger
 * /api/categories/{categoryId}/subcategories/{id}:
 *   put:
 *     summary: Update a subcategory by ID
 *     description: Updates a subcategory’s name and/or image under a category ID (admin only)
 *     tags: [Subcategory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the parent category
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the subcategory to update
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: The new name for the subcategory
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Optional new image file to upload
 *           example:
 *             name: "Luxury Retreats"
 *             image: new_image.jpg
 *     responses:
 *       200:
 *         description: Subcategory updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Luxury Retreats"
 *                     image:
 *                       type: string
 *                       nullable: true
 *                       example: "https://res.cloudinary.com/.../new_image.jpg"
 *                     createdBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         username:
 *                           type: string
 *                           example: "adminuser"
 *                     category:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 3
 *                         name:
 *                           type: string
 *                           example: "Accommodation"
 *       400:
 *         description: Invalid input data or category ID
 *       401:
 *         description: Unauthorized (user not authenticated)
 *       403:
 *         description: Forbidden (user not an admin)
 *       404:
 *         description: Subcategory not found
 *       500:
 *         description: Internal server error
 */
router.put('/:categoryId/subcategories/:id', authMiddleware, isAdminOrStaff, upload.single('image'), validateZod(updateSubcategorySchema), subcategoryController.updateSubcategory.bind(subcategoryController));


/**
 * @swagger
 * /api/categories/{categoryId}/subcategories/{id}:
 *   delete:
 *     summary: Delete a subcategory by ID within a category
 *     description: Deletes the specified subcategory under a category (Admin only)
 *     tags: [Subcategory]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the parent category
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the subcategory to delete
 *     responses:
 *       204:
 *         description: Subcategory deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Subcategory deleted"
 *       400:
 *         description: Validation error or invalid IDs
 *       401:
 *         description: Unauthorized (missing or invalid auth token)
 *       404:
 *         description: Subcategory not found
 *       500:
 *         description: Internal server error
 */

router.delete('/:categoryId/subcategories/:id', authMiddleware, isAdminOrStaff, subcategoryController.deleteSubcategory.bind(subcategoryController));

/**
 * @swagger
 * /api/categories/{categoryId}/subcategories/{subcategoryId}/products:
 *   post:
 *     summary: Create a new product
 *     description: Creates a new product under a specified category and subcategory. Only authenticated vendors can create products. Supports uploading up to 5 images.
 *     tags: [Product]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: The ID of the category
 *       - in: path
 *         name: subcategoryId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: The ID of the subcategory
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - basePrice
 *               - stock
 *               - quantity
 *             properties:
 *               name:
 *                 type: string
 *                 description: Product name
 *                 example: "New Product"
 *               description:
 *                 type: string
 *                 description: Product description
 *                 example: "This is a new product description."
 *               basePrice:
 *                 type: string
 *                 description: Base price of the product (will be converted to number)
 *                 example: "99.99"
 *               stock:
 *                 type: string
 *                 description: Stock quantity (will be converted to integer)
 *                 example: "100"
 *               discount:
 *                 type: string
 *                 description: Discount amount (will be converted to number)
 *                 example: "10"
 *               discountType:
 *                 type: string
 *                 enum: [PERCENTAGE, FLAT]
 *                 description: Type of discount
 *                 example: "PERCENTAGE"
 *               size:
 *                 type: string
 *                 description: Comma-separated list of available sizes (e.g., "S,M,L")
 *                 example: "S,M,L"
 *               status:
 *                 type: string
 *                 enum: [AVAILABLE, LOW_STOCK, OUT_OF_STOCK]
 *                 description: Inventory status
 *                 example: "AVAILABLE"
 *               quantity:
 *                 type: string
 *                 description: Quantity of the product (will be converted to number)
 *                 example: "100"
 *               brand_id:
 *                 type: string
 *                 description: Brand ID (will be converted to number or null)
 *                 example: "1"
 *               dealId:
 *                 type: string
 *                 description: Deal ID (will be converted to number or null)
 *                 example: "1"
 *               bannerId: 
 *                  type: string
 *                  description: Banner ID (optional, will be converted to number or null)
 *                  example: "1"
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Up to 5 product images
 *                 maxItems: 5
 *     responses:
 *       201:
 *         description: Product created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "New Product"
 *                     description:
 *                       type: string
 *                       example: "This is a new product description."
 *                     basePrice:
 *                       type: number
 *                       example: 99.99
 *                     stock:
 *                       type: integer
 *                       example: 100
 *                     discount:
 *                       type: number
 *                       example: 10
 *                     discountType:
 *                       type: string
 *                       enum: [PERCENTAGE, FLAT]
 *                       example: "PERCENTAGE"
 *                     size:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["S", "M", "L"]
 *                     status:
 *                       type: string
 *                       enum: [AVAILABLE, LOW_STOCK, OUT_OF_STOCK]
 *                       example: "AVAILABLE"
 *                     quantity:
 *                       type: number
 *                       example: 100
 *                     productImages:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["https://res.cloudinary.com/example/image1.jpg"]
 *                     subcategory:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         name:
 *                           type: string
 *                           example: "Electronics"
 *                     vendor:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 3
 *                         name:
 *                           type: string
 *                           example: "Vendor Name"
 *                     deal:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 2
 *                         discountPercentage:
 *                           type: number
 *                           example: 20
 *                     finalPrice:
 *                       type: number
 *                       example: 79.99
 *                     bannerId:
 *                       type: string
 *                       description: Banner ID (will be converted to number or null)
 *                       example: "1"
 *       400:
 *         description: Bad request (e.g., invalid deal, total discount exceeds 100%, or negative final price)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Total discount cannot exceed 100%"
 *       403:
 *         description: Unauthorized (vendor authentication failed)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Unauthorized"
 *       404:
 *         description: Category, subcategory, or vendor not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Category not found"
 *       500:
 *         description: Internal server error (e.g., image upload failure)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal Server Error"
 */
router.post('/:categoryId/subcategories/:subcategoryId/products', combinedAuthMiddleware, requireAdminStaffOrVendor, upload.array('images', 5), validateZod(createProductSchema), productController.createProduct.bind(productController))

// /**
//  * @swagger
//  * /api/categories/{categoryId}/subcategories/{subcategoryId}/products:
//  *   get:
//  *     summary: Get filtered products
//  *     description: Fetches products from a specific subcategory and category, with optional filters for brand, deal, and price sorting.
//  *     tags:
//  *       - Product
//  *     parameters:
//  *       - in: path
//  *         name: categoryId
//  *         required: true
//  *         schema:
//  *           type: integer
//  *         description: ID of the category to filter by.
//  *       - in: path
//  *         name: subcategoryId
//  *         required: true
//  *         schema:
//  *           type: integer
//  *         description: ID of the subcategory to filter by.
//  *       - in: query
//  *         name: brandId
//  *         required: false
//  *         schema:
//  *           type: integer
//  *           minimum: 1
//  *         description: Filter products by brand ID.
//  *       - in: query
//  *         name: dealId
//  *         required: false
//  *         schema:
//  *           type: integer
//  *           minimum: 1
//  *         description: Filter products by deal ID.
//  *       - in: query
//  *         name: sort
//  *         required: false
//  *         schema:
//  *           type: string
//  *           enum: [all, low-to-high, high-to-low]
//  *           default: all
//  *     responses:
//  *       200:
//  *         description: Products retrieved successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *                 data:
//  *                   type: array
//  *                   items:
//  *                     type: object
//  *                     properties:
//  *                       id:
//  *                         type: integer
//  *                       name:
//  *                         type: string
//  *                       description:
//  *                         type: string
//  *                       basePrice:
//  *                         type: number
//  *                         format: float
//  *                       stock:
//  *                         type: integer
//  *                       discount:
//  *                         type: number
//  *                         format: float
//  *                       discountType:
//  *                         type: string
//  *                         enum: [PERCENTAGE, FLAT]
//  *                       size:
//  *                         type: array
//  *                         items:
//  *                           type: string
//  *                       productImages:
//  *                         type: array
//  *                         items:
//  *                           type: string
//  *                       status:
//  *                         type: string
//  *                         enum: [AVAILABLE, OUT_OF_STOCK, LOW_STOCK]
//  *                       quantity:
//  *                         type: integer
//  *                       vendorId:
//  *                         type: integer
//  *                       userId:
//  *                         type: integer
//  *                       brand_id:
//  *                         type: integer
//  *                       dealId:
//  *                         type: integer
//  *                       created_at:
//  *                         type: string
//  *                         format: date-time
//  *                       updated_at:
//  *                         type: string
//  *                         format: date-time
//  *       400:
//  *         description: Validation error in query or path parameters.
//  *       500:
//  *         description: Internal server error.
//  */
// router.get('/:categoryId/subcategories/:subcategoryId/products', validateZod(productQuerySchema), productController.getProducts.bind(productController));

/**
 * @swagger
 * /api/categories/all/products:
 *   get:
 *     summary: Retrieve all products with optional filtering
 *     description: Fetches products with optional filtering by brand, category, subcategory, deal, and sorting options.
 *     tags: [Product]
 *     parameters:
 *       - in: query
 *         name: brandId
 *         schema:
 *           type: string
 *         description: Filter by brand ID (positive integer)
 *         example: "1"
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *         description: Filter by category ID (positive integer)
 *         example: "2"
 *       - in: query
 *         name: subcategoryId
 *         schema:
 *           type: string
 *         description: Filter by subcategory ID (positive integer)
 *         example: "5"
 *       - in: query
 *         name: dealId
 *         schema:
 *           type: string
 *         description: Filter by deal ID (positive integer)
 *         example: "1"
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [all, low-to-high, high-to-low]
 *           default: all
 *         description: Sort products by price
 *         example: "low-to-high"
 *     responses:
 *       200:
 *         description: Products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Products retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: "Wireless Headphones"
 *                       description:
 *                         type: string
 *                         example: "Noise cancelling over-ear headphones"
 *                       basePrice:
 *                         type: number
 *                         format: float
 *                         example: 199.99
 *                       stock:
 *                         type: integer
 *                         example: 25
 *                       discount:
 *                         type: number
 *                         format: float
 *                         example: 10.5
 *                       discountType:
 *                         type: string
 *                         enum: [PERCENTAGE, FLAT]
 *                         example: "PERCENTAGE"
 *                       size:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["S", "M", "L"]
 *                       productImages:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["image1.jpg", "image2.jpg"]
 *                       inventory:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             sku:
 *                               type: string
 *                               example: "SKU1234"
 *                             quantity:
 *                               type: integer
 *                               example: 10
 *                             status:
 *                               type: string
 *                               enum: [AVAILABLE, OUT_OF_STOCK, LOW_STOCK]
 *                               example: "AVAILABLE"
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-01T00:00:00Z"
 *                       updated_at:
 *                         type: string
 *                         format: date-time
 *                         example: "2024-01-05T12:34:56Z"
 *                       brand:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 2
 *                           name:
 *                             type: string
 *                             example: "Sony"
 *                       vendor:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 3
 *                           name:
 *                             type: string
 *                             example: "ElectroMart"
 *                       deal:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 1
 *                           title:
 *                             type: string
 *                             example: "New Year Deal"
 *                       subcategory:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 5
 *                           name:
 *                             type: string
 *                             example: "Headphones"
 *                           category:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 1
 *                               name:
 *                                 type: string
 *                                 example: "Electronics"
 *       400:
 *         description: Bad request - Invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Brand ID must be a positive integer"
 *       500:
 *         description: Internal server error
 */
router.get('/all/products', productController.getAllProducts.bind(productController));

/**
 * @swagger
 * /api/categories/{categoryId}/subcategories/{subcategoryId}/products/{id}:
 *   get:
 *     summary: Get a product by ID within a subcategory and category
 *     description: Retrieve a specific product with its subcategory and vendor information.
 *     tags: [Product]
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the parent category
 *       - in: path
 *         name: subcategoryId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the subcategory
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product
 *     responses:
 *       200:
 *         description: Product retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 101
 *                     name:
 *                       type: string
 *                       example: "Bluetooth Speaker"
 *                     description:
 *                       type: string
 *                       example: "Portable Bluetooth speaker with rich bass"
 *                     basePrice:
 *                       type: number
 *                       format: float
 *                       example: 49.99
 *                     stock:
 *                       type: integer
 *                       example: 12
 *                     discount:
 *                       type: number
 *                       format: float
 *                       example: 5.0
 *                     discountType:
 *                       type: string
 *                       enum: [PERCENTAGE, FLAT]
 *                       example: "FLAT"
 *                     size:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["S", "M"]
 *                     productImages:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["img1.jpg", "img2.jpg"]
 *                     inventory:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sku:
 *                             type: string
 *                             example: "SKU123"
 *                           quantity:
 *                             type: integer
 *                             example: 8
 *                           status:
 *                             type: string
 *                             enum: [AVAILABLE, OUT_OF_STOCK, LOW_STOCK]
 *                             example: "AVAILABLE"
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-04-10T10:00:00Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-04-15T12:00:00Z"
 *                     subcategory:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 5
 *                         name:
 *                           type: string
 *                           example: "Audio Devices"
 *                     vendor:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 2
 *                         name:
 *                           type: string
 *                           example: "GadgetWorld"
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */

router.get('/:categoryId/subcategories/:subcategoryId/products/:id', productController.getProductById.bind(productController));

/**
 * @swagger
 * /api/categories/{categoryId}/subcategories/{subcategoryId}/products/{id}:
 *   put:
 *     summary: Update a product
 *     description: Updates an existing product by ID. Only admins or the product's vendor can update the product. Supports uploading up to 5 images.
 *     tags: [Product]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: The ID of the category
 *       - in: path
 *         name: subcategoryId
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: The ID of the subcategory
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: The ID of the product to update
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Product name
 *                 example: "Updated Product"
 *               description:
 *                 type: string
 *                 description: Product description
 *                 example: "This is an updated product description."
 *               basePrice:
 *                 type: string
 *                 description: Base price of the product (will be converted to number)
 *                 example: "99.99"
 *               stock:
 *                 type: string
 *                 description: Stock quantity (will be converted to integer)
 *                 example: "50"
 *               discount:
 *                 type: string
 *                 description: Discount amount (will be converted to number)
 *                 example: "10"
 *               discountType:
 *                 type: string
 *                 enum: [PERCENTAGE, FLAT]
 *                 description: Type of discount
 *                 example: "PERCENTAGE"
 *               size:
 *                 type: string
 *                 description: Comma-separated list of available sizes (e.g., "S,M,L")
 *                 example: "S,M,L"
 *               status:
 *                 type: string
 *                 enum: [AVAILABLE, LOW_STOCK, OUT_OF_STOCK]
 *                 description: Inventory status
 *                 example: "AVAILABLE"
 *               quantity:
 *                 type: string
 *                 description: Quantity of the product (will be converted to number)
 *                 example: "100"
 *               brand_id:
 *                 type: string
 *                 description: Brand ID (will be converted to number or null)
 *                 example: "1"
 *               dealId:
 *                 type: string
 *                 description: Deal ID (will be converted to number or null)
 *                 example: "2"
 *               vendorId:
 *                 type: string
 *                 description: Vendor ID (will be converted to number or null)
 *                 example: "3"
 *               userId:
 *                 type: string
 *                 description: User ID (will be converted to number or null)
 *                 example: "4"
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Up to 5 product images
 *                 maxItems: 5
 *     responses:
 *       200:
 *         description: Product updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Updated Product"
 *                     description:
 *                       type: string
 *                       example: "This is an updated product description."
 *                     basePrice:
 *                       type: number
 *                       example: 99.99
 *                     stock:
 *                       type: integer
 *                       example: 50
 *                     discount:
 *                       type: number
 *                       example: 10
 *                     discountType:
 *                       type: string
 *                       enum: [PERCENTAGE, FLAT]
 *                       example: "PERCENTAGE"
 *                     size:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["S", "M", "L"]
 *                     status:
 *                       type: string
 *                       enum: [AVAILABLE, LOW_STOCK, OUT_OF_STOCK]
 *                       example: "AVAILABLE"
 *                     quantity:
 *                       type: number
 *                       example: 100
 *                     productImages:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["https://res.cloudinary.com/example/image1.jpg"]
 *                     subcategory:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         name:
 *                           type: string
 *                           example: "Electronics"
 *                     vendor:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 3
 *                         name:
 *                           type: string
 *                           example: "Vendor Name"
 *                     brand:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 1
 *                         name:
 *                           type: string
 *                           example: "Brand Name"
 *                     deal:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: integer
 *                           example: 2
 *                         discountPercentage:
 *                           type: number
 *                           example: 20
 *                     finalPrice:
 *                       type: number
 *                       example: 79.99
 *       400:
 *         description: Bad request (e.g., invalid deal or total discount exceeds 100%)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Total discount cannot exceed 100%"
 *       403:
 *         description: Unauthorized (user is not the vendor or admin)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Unauthorized"
 *       404:
 *         description: Product or vendor not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Product not found or access denied"
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Internal Server Error"
 */
router.put('/:categoryId/subcategories/:subcategoryId/products/:id', combinedAuthMiddleware, isVendorAccountOwnerOrAdminOrStaff, upload.array('images', 5), validateZod(updateProductSchema), productController.updateProduct.bind(productController));

// /**
//  * @swagger
//  * /api/categories/{categoryId}/subcategories/{subcategoryId}/products/{id}:
//  *   delete:
//  *     summary: Delete a product by ID
//  *     description: Allows vendors to delete their own product or admins to delete any product.
//  *     tags: [Product]
//  *     security:
//  *       - bearerAuth: []
//  *     parameters:
//  *       - in: path
//  *         name: categoryId
//  *         required: true
//  *         schema:
//  *           type: integer
//  *         description: ID of the parent category
//  *       - in: path
//  *         name: subcategoryId
//  *         required: true
//  *         schema:
//  *           type: integer
//  *         description: ID of the subcategory
//  *       - in: path
//  *         name: id
//  *         required: true
//  *         schema:
//  *           type: integer
//  *         description: ID of the product to delete
//  *     responses:
//  *       204:
//  *         description: Product deleted successfully
//  *         content:
//  *           application/json:
//  *             schema:
//  *               type: object
//  *               properties:
//  *                 success:
//  *                   type: boolean
//  *                   example: true
//  *       401:
//  *         description: Unauthorized (missing or invalid token)
//  *       403:
//  *         description: Forbidden (not allowed to delete this product)
//  *       404:
//  *         description: Product or user not found
//  *       500:
//  *         description: Internal server error
//  */

// router.delete('/:categoryId/subcategories/:subcategoryId/products/:id', authMiddleware, restrictToVendorOrAdmin, productController.deleteProduct.bind(productController));

/**
 * @swagger
 * /api/categories/{categoryId}/subcategories/{subcategoryId}/products/{id}/images:
 *   delete:
 *     summary: Delete an image from a product
 *     description: Allows admin or product-owning vendor to delete a specific image URL from a product.
 *     tags:
 *       - Product
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: categoryId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the parent category
 *       - in: path
 *         name: subcategoryId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the subcategory
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product
 *     requestBody:
 *       description: The image URL to be removed from the product
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - imageUrl
 *             properties:
 *               imageUrl:
 *                 type: string
 *                 example: https://res.cloudinary.com/yourcloud/image/upload/sample.jpg
 *     responses:
 *       200:
 *         description: Product image deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 17
 *                     name:
 *                       type: string
 *                       example: iPhone 15 Pro Max
 *                     description:
 *                       type: string
 *                       example: Flagship Apple phone with A17 Pro chip
 *                     basePrice:
 *                       type: number
 *                       example: 182000
 *                     stock:
 *                       type: integer
 *                       example: 12
 *                     size:
 *                       type: string
 *                       example: 6.7"
 *                     productImages:
 *                       type: array
 *                       items:
 *                         type: string
 *                         example: https://res.cloudinary.com/yourcloud/image/upload/sample.jpg
 *       400:
 *         description: Bad request (missing or invalid image URL)
 *       403:
 *         description: Forbidden - Not the product owner or admin
 *       404:
 *         description: Product or image not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:categoryId/subcategories/:subcategoryId/products/:id/images', combinedAuthMiddleware, requireAdminStaffOrVendor, productController.deleteProductImage.bind(productController));
export default router;