import { Router } from "express";
import { ProductController } from "../controllers/product.controller";

const productRouter = Router();
const productController = new ProductController();

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

export default productRouter;