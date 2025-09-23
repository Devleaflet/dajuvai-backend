import { Router } from "express";
import { ProductController } from "../controllers/product.controller";
import AppDataSource from "../config/db.config";
import { uploadMiddleware } from "../config/multer.config";
import { authMiddleware, isAdminOrStaff } from "../middlewares/auth.middleware";

const productRouter = Router();
const productController = new ProductController(AppDataSource);

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
 *                     description:
 *                       type: string
 *                       example: "Raw and organic honey collected from forest bees."
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
 *                       enum: [PERCENTAGE, FLAT]
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
 *                     brand_id:
 *                       type: integer
 *                       nullable: true
 *                       example: 2
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
productRouter.get("/:id", productController.getProductDetailById.bind(productController))

productRouter.delete("/:id", productController.deleteProductById.bind(productController));

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
productRouter.post("/image/upload", uploadMiddleware, productController.uplaodImage.bind(productController))

productRouter.get("/admin/products",  productController.getAdminProducts.bind(productController))
//authMiddleware, isAdminOrStaff,
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
 *         price:
 *           type: number
 *           format: float
 *           example: 499.99
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
 *         - price
 *         - stock
 *         - status
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
 *         description:
 *           type: string
 *           example: "The latest Apple iPhone with A17 chip."
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
 *             - PERCENTAGE
 *             - FLAT
 *           example: "PERCENTAGE"
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
 *         brandId:
 *           type: integer
 *           example: 7
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