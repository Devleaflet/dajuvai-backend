import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { ProductRecommendController } from "../controllers/product.recommend.controller";

const productRecommendRouter = Router();
const controller = new ProductRecommendController();

/**
 * @swagger
 * /api/profile/product-recommend:
 *   get:
 *     summary: Get personalized product recommendations
 *     description: >
 *       Returns a personalized list of products based on the authenticated user's
 *       past orders, cart items, and wishlist. Products are grouped by subcategory,
 *       with subcategories prioritized by interaction frequency. Up to 5 randomly
 *       selected products are returned per subcategory. Products already in the
 *       user's orders, cart, or wishlist are excluded.
 *     tags:
 *       - Recommendations
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Personalized product recommendations retrieved successfully
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
 *                         example: 42
 *                       name:
 *                         type: string
 *                         example: "Wireless Headphones Pro"
 *                       description:
 *                         type: string
 *                         nullable: true
 *                         example: "High quality noise cancelling headphones"
 *                       basePrice:
 *                         type: number
 *                         nullable: true
 *                         example: 4999.00
 *                       finalPrice:
 *                         type: number
 *                         nullable: true
 *                         example: 4499.00
 *                       discount:
 *                         type: number
 *                         example: 10
 *                       discountType:
 *                         type: string
 *                         enum: [NONE, PERCENTAGE, FLAT]
 *                         example: "PERCENTAGE"
 *                       status:
 *                         type: string
 *                         nullable: true
 *                         enum: [AVAILABLE, OUT_OF_STOCK, LOW_STOCK]
 *                         example: "AVAILABLE"
 *                       stock:
 *                         type: integer
 *                         nullable: true
 *                         example: 25
 *                       hasVariants:
 *                         type: boolean
 *                         example: false
 *                       productImages:
 *                         type: array
 *                         nullable: true
 *                         items:
 *                           type: string
 *                         example: ["https://res.cloudinary.com/example/image/upload/prod1.jpg"]
 *                       subcategoryId:
 *                         type: integer
 *                         nullable: true
 *                         example: 5
 *                       subcategory:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 5
 *                           name:
 *                             type: string
 *                             example: "Audio"
 *                       brand:
 *                         type: object
 *                         nullable: true
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 3
 *                           name:
 *                             type: string
 *                             example: "Sony"
 *                       variants:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                               example: "v-001"
 *                             sku:
 *                               type: string
 *                               example: "HP-PRO-BLK"
 *                             basePrice:
 *                               type: number
 *                               example: 4999.00
 *                             finalPrice:
 *                               type: number
 *                               nullable: true
 *                               example: 4499.00
 *                             stock:
 *                               type: integer
 *                               example: 10
 *                             status:
 *                               type: string
 *                               enum: [AVAILABLE, OUT_OF_STOCK, LOW_STOCK]
 *                               example: "AVAILABLE"
 *                             attributes:
 *                               type: object
 *                               nullable: true
 *                               example: { "color": "Black" }
 *                             variantImages:
 *                               type: array
 *                               items:
 *                                 type: string
 *                               example: ["https://res.cloudinary.com/example/image/upload/v1.jpg"]
 *             example:
 *               success: true
 *               data:
 *                 - id: 42
 *                   name: "Wireless Headphones Pro"
 *                   description: "High quality noise cancelling headphones"
 *                   basePrice: 4999.00
 *                   finalPrice: 4499.00
 *                   discount: 10
 *                   discountType: "PERCENTAGE"
 *                   status: "AVAILABLE"
 *                   stock: 25
 *                   hasVariants: false
 *                   productImages: ["https://res.cloudinary.com/example/image/upload/prod1.jpg"]
 *                   subcategoryId: 5
 *                   subcategory:
 *                     id: 5
 *                     name: "Audio"
 *                   brand:
 *                     id: 3
 *                     name: "Sony"
 *                   variants: []
 *       401:
 *         description: Unauthorized - missing or invalid token
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
 *                   example: "Internal server error"
 */
productRecommendRouter.get("/product-recommend", authMiddleware, controller.getRecommendations());

export default productRecommendRouter;