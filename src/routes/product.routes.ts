import { Router } from "express";
import { ProductController } from "../controllers/product.controller";
import AppDataSource from "../config/db.config";
import { uploadMiddleware } from "../config/multer.config";
import {
    authMiddleware,
    combinedAuthMiddleware,
    isAccountOwner,
    isAccountOwnerOrAdmin,
    isAdmin,
    isAdminOrStaff,
    isAdminOrVendor,
    isVendor,
    isVendorAccountOwnerOrAdminOrStaff,
    requireAdminStaffOrVendor,
    restrictToVendorOrAdmin,
    vendorAuthMiddleware,
} from "../middlewares/auth.middleware";
import { checkPermission } from "../middlewares/permission.middleware";
import { ModuleName, PermissionLevel } from "../entities/permission.enum";
import { responseCache } from "../middlewares/responseCache.middleware";

const productRouter = Router();
const productController = new ProductController(AppDataSource);

/**
 * @swagger
 * /api/product/archived:
 *   get:
 *     summary: Get archived (soft-deleted) products
 *     description: Retrieves a list of products that have been soft-deleted/archived. Requires vendor or admin authentication.
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of archived products retrieved successfully
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
 *                         type: integer
 *                         example: 15
 *                       name:
 *                         type: string
 *                         example: "Discontinued Widget"
 *                       basePrice:
 *                         type: number
 *                         format: float
 *                         example: 29.99
 *                       status:
 *                         type: string
 *                         example: "DISCONTINUED"
 *                       deletedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-06-10T12:00:00Z"
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden - Not a vendor or admin
 *       500:
 *         description: Internal server error
 */
// /api/product/archived — must be registered before GET /:id below,
// otherwise Express would match "archived" as an :id value and route there.
productRouter.get(
    "/archived",
    combinedAuthMiddleware,
    isAdminOrVendor,
    productController.getArchivedProducts.bind(productController),
);

/**
 * @swagger
 * /api/product/{id}:
 *   get:
 *     summary: Get product details by ID
 *     tags:
 *       - Products
 *     parameters:
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
 *                 product:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     name:
 *                       type: string
 *                       example: "Organic Honey"
 *                     brand:
 *                       type: string
 *                       example: "Dabur"
 *                     description:
 *                       type: string
 *                       example: "Raw and organic honey collected from forest bees."
 *                     keywords:
 *                       type: string
 *                       example: "honey,food,health,organic"
 *                     basePrice:
 *                       type: number
 *                       format: float
 *                       example: 19.99
 *                     stock:
 *                       type: integer
 *                       example: 150
 *                     discount:
 *                       type: number
 *                       format: float
 *                       example: 10.0
 *                     discountType:
 *                       type: string
 *                       enum: [NONE, PERCENTAGE, FLAT]
 *                       example: PERCENTAGE
 *                     size:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["250ml", "500ml"]
 *                     productImages:
 *                       type: array
 *                       items:
 *                         type: string
 *                         format: uri
 *                       example: ["https://example.com/image1.jpg", "https://example.com/image2.jpg"]
 *                     inventory:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sku:
 *                             type: string
 *                             example: "HNY-001"
 *                           quantity:
 *                             type: integer
 *                             example: 50
 *                           status:
 *                             type: string
 *                             enum: [AVAILABLE, OUT_OF_STOCK, LOW_STOCK]
 *                             example: AVAILABLE
 *                     vendorId:
 *                       type: integer
 *                       example: 3
 *                     dealId:
 *                       type: integer
 *                       nullable: true
 *                       example: 1
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:00:00Z"
 *                     updated_at:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-06-10T12:45:00Z"
 *       404:
 *         description: Product not found
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
 *                   example: Product does not exist
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
productRouter.get(
    "/:id",
    responseCache({ ttlSeconds: 60 }),
    productController.getProductDetailById.bind(productController),
);

/**
 * @swagger
 * /api/product/{id}:
 *   delete:
 *     summary: Delete a product by ID
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the product to delete
 *     responses:
 *       200:
 *         description: Product deleted successfully
 *         content:
 *           application/json:
 *             example: { success: true, msg: "Product deleted successfully" }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */
// /api/product/:id
productRouter.delete(
    "/:id",
    combinedAuthMiddleware,
    isAdminOrVendor,
    productController.deleteProductById.bind(productController),
);

/**
 * @swagger
 * /api/product/{id}/restore:
 *   patch:
 *     summary: Restore an archived (soft-deleted) product
 *     description: Restores a product that was previously soft-deleted/archived, making it active again. Requires vendor or admin authentication.
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the archived product to restore
 *     responses:
 *       200:
 *         description: Product restored successfully
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
 *                   example: "Product restored successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 15
 *                     name:
 *                       type: string
 *                       example: "Restored Widget"
 *                     status:
 *                       type: string
 *                       example: "AVAILABLE"
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *       403:
 *         description: Forbidden - Not a vendor or admin
 *       404:
 *         description: Product not found
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
 *                   example: "Product not found"
 *       500:
 *         description: Internal server error
 */
// /api/product/:id/restore — restores an archived (soft-deleted) product.
productRouter.patch(
    "/:id/restore",
    combinedAuthMiddleware,
    isAdminOrVendor,
    productController.restoreProductById.bind(productController),
);

/**
 * @swagger
 * /api/product/{id}/variant/{variantId}/restore:
 *   patch:
 *     summary: Restore a single archived variant
 *     description: Restores a specific variant that was previously soft-deleted/archived under a product. Requires vendor or admin authentication.
 *     tags:
 *       - Products
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the parent product
 *       - in: path
 *         name: variantId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the archived variant to restore
 *     responses:
 *       200:
 *         description: Variant restored successfully
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
 *                   example: "Variant restored successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 60
 *                     sku:
 *                       type: string
 *                       example: "SKU-GRAY"
 *                     status:
 *                       type: string
 *                       example: "AVAILABLE"
 *       401:
 *         description: Unauthorized - Missing or invalid token
 *       403:
 *         description: Forbidden - Not a vendor or admin
 *       404:
 *         description: Product or variant not found
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
 *                   example: "Variant not found"
 *       500:
 *         description: Internal server error
 */
// /api/product/:id/variant/:variantId/restore — restores a single archived variant.
productRouter.patch(
    "/:id/variant/:variantId/restore",
    combinedAuthMiddleware,
    isAdminOrVendor,
    productController.restoreVariant.bind(productController),
);

/**
 * @swagger
 * /api/product/image/upload:
 *   post:
 *     summary: Upload product images to Cloudinary
 *     tags:
 *       - Products
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *             required:
 *               - files
 *     responses:
 *       200:
 *         description: Images uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 urls:
 *                   type: array
 *                   items:
 *                     type: string
 *                     example: https://res.cloudinary.com/.../prod_12345.jpg
 *       400:
 *         description: No files uploaded
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
 *                   example: No files uploaded
 *       500:
 *         description: Image upload failed
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
 *                   example: Image upload failed
 */
productRouter.post(
    "/image/upload",
    combinedAuthMiddleware,
    uploadMiddleware,
    productController.uplaodImage.bind(productController),
);

/**
 * @swagger
 * /api/product/admin/products:
 *   get:
 *     summary: Get all products for admin panel
 *     tags:
 *       - Products
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, default: 10 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: List of all products for admin
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               data:
 *                 products: []
 *                 total: 0
 *                 pagination: { page: 1, limit: 10, totalItems: 0, totalPages: 0, hasNextPage: false, hasPreviousPage: false }
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
// /api/product/admin/products
productRouter.get(
    "/admin/products",
    authMiddleware,
    isAdminOrStaff,
    checkPermission(ModuleName.PRODUCT, PermissionLevel.VIEW),
    productController.getAdminProducts.bind(productController),
);

export default productRouter;

// product schema
/**
 * @swagger
 * components:
 *   schemas:
 *     Image:
 *       type: object
 *       properties:
 *         url:
 *           type: string
 *           format: uri
 *           example: "https://example.com/image.png"
 *       required:
 *         - url
 *
 *     Attribute:
 *       type: object
 *       properties:
 *         attributeType:
 *           type: string
 *           example: "Color"
 *         attributeValues:
 *           type: array
 *           items:
 *             type: string
 *             example: "Red"
 *       required:
 *         - attributeType
 *         - attributeValues
 *
 *     ProductVariant:
 *       type: object
 *       properties:
 *         sku:
 *           type: string
 *           example: "SKU12345"
 *         basePrice:
 *           type: number
 *           format: float
 *           example: 499.99
 *         price:
 *           type: number
 *           format: float
 *           example: 499.99
 *         discountAmount:
 *           type: number
 *           format: float
 *           example: 10.0
 *         discountPercent:
 *           type: number
 *           format: float
 *           example: 10.0
 *         discountType:
 *           type: string
 *           enum:
 *             - NONE
 *             - PERCENTAGE
 *             - FLAT
 *           example: "NONE"
 *         stock:
 *           type: integer
 *           example: 50
 *         status:
 *           type: string
 *           enum:
 *             - AVAILABLE
 *             - OUT_OF_STOCK
 *             - LOW_STOCK
 *           example: "AVAILABLE"
 *         attributes:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/Attribute"
 *         images:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/Image"
 *       required:
 *         - sku
 *         - stock
 *
 *     Product:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           readOnly: true
 *           example: 1
 *         name:
 *           type: string
 *           example: "iPhone 15 Pro"
 *         brand:
 *           type: string
 *           example: "Apple"
 *         description:
 *           type: string
 *           example: "The latest Apple iPhone with A17 chip."
 *         keywords:
 *           type: string
 *           example: "apple,smartphone,flagship"
 *         basePrice:
 *           type: number
 *           format: float
 *           example: 1299.99
 *         discount:
 *           type: number
 *           format: float
 *           example: 10
 *           description: "Discount value (percentage or flat)."
 *         discountType:
 *           type: string
 *           enum:
 *             - NONE
 *             - PERCENTAGE
 *             - FLAT
 *           example: "NONE"
 *         status:
 *           type: string
 *           enum:
 *             - AVAILABLE
 *             - OUT_OF_STOCK
 *             - LOW_STOCK
 *           example: "AVAILABLE"
 *         stock:
 *           type: integer
 *           example: 100
 *         hasVariants:
 *           type: boolean
 *           example: true
 *         variants:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/ProductVariant"
 *         productImages:
 *           type: array
 *           items:
 *             $ref: "#/components/schemas/Image"
 *         subcategoryId:
 *           type: integer
 *           example: 5
 *         dealId:
 *           type: integer
 *           example: 2
 *         bannerId:
 *           type: integer
 *           example: 3
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *       required:
 *         - name
 *         - hasVariants
 */
