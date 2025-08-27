import { Router } from 'express';

import { authMiddleware, isAccountOwner, requireUserRole, validateZod } from '../middlewares/auth.middleware';
import { addToCartSchema, removeFromCartSchema } from '../utils/zod_validations/cart.zod';
import { CartController } from '../controllers/cart.controller';

const cartRouter = Router();
const cartController = new CartController();
/**
 * @swagger
 * /api/cart:
 *   post:
 *     summary: Add a product (or variant) to the authenticated user's cart
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               productId:
 *                 type: integer
 *                 example: 35
 *                 description: ID of the product to add
 *               quantity:
 *                 type: integer
 *                 example: 2
 *                 description: Number of items to add
 *               variantId:
 *                 type: integer
 *                 example: 60
 *                 description: Optional variant ID if product has variants
 *             required:
 *               - productId
 *               - quantity
 *     responses:
 *       200:
 *         description: Product successfully added to cart
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
 *                       example: 3
 *                     userId:
 *                       type: integer
 *                       example: 12
 *                     total:
 *                       type: number
 *                       example: 55992
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 6
 *                           quantity:
 *                             type: integer
 *                             example: 8
 *                           price:
 *                             type: number
 *                             example: 6999
 *                           name:
 *                             type: string
 *                             example: "RLX | Luxury Explorer | 16570"
 *                           description:
 *                             type: string
 *                             example: ""
 *                           image:
 *                             type: string
 *                             format: uri
 *                             example: "https://res.cloudinary.com/dxvyc12au/image/upload/v1755502381/products/prod_1755502378837.jpg"
 *                           variantId:
 *                             type: integer
 *                             example: 60
 *                           product:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 35
 *                               name:
 *                                 type: string
 *                                 example: "RLX | Luxury Explorer | 16570"
 *                               description:
 *                                 type: string
 *                                 example: null
 *                               basePrice:
 *                                 type: number
 *                                 example: null
 *                               discount:
 *                                 type: string
 *                                 example: "0.00"
 *                               discountType:
 *                                 type: string
 *                                 example: "PERCENTAGE"
 *                               status:
 *                                 type: string
 *                                 example: "AVAILABLE"
 *                               stock:
 *                                 type: integer
 *                                 example: null
 *                               hasVariants:
 *                                 type: boolean
 *                                 example: true
 *                           variant:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 60
 *                               sku:
 *                                 type: string
 *                                 example: "SKU-GRAY"
 *                               basePrice:
 *                                 type: number
 *                                 example: 6999
 *                               discount:
 *                                 type: string
 *                                 example: "0.00"
 *                               discountType:
 *                                 type: string
 *                                 example: "PERCENTAGE"
 *                               attributes:
 *                                 type: object
 *                                 properties:
 *                                   color:
 *                                     type: string
 *                                     example: "Gray"
 *                               variantImages:
 *                                 type: array
 *                                 items:
 *                                   type: string
 *                                   format: uri
 *                                   example: "https://res.cloudinary.com/dxvyc12au/image/upload/v1755502381/products/prod_1755502378837.jpg"
 *                               stock:
 *                                 type: integer
 *                                 example: 10
 *                               status:
 *                                 type: string
 *                                 example: "AVAILABLE"
 *                               productId:
 *                                 type: integer
 *                                 example: 35
 *       400:
 *         description: Invalid input or insufficient stock
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
 *                   example: "Cannot add 8 items; only 5 available for this variant"
 *       401:
 *         description: Unauthorized - user not logged in
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
 *                   example: "Product not found"
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
cartRouter.post('/', authMiddleware, requireUserRole, validateZod(addToCartSchema), cartController.addToCart.bind(cartController));


/**
 * @swagger
 * /api/cart:
 *   delete:
 *     summary: Remove an item from the authenticated user's cart or decrease its quantity
 *     tags:
 *       - Cart
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cartItemId:
 *                 type: integer
 *                 example: 9
 *                 description: ID of the cart item to remove or decrease
 *               decreaseOnly:
 *                 type: boolean
 *                 example: true
 *                 description: If true, decreases quantity by 1 instead of removing the item entirely
 *             required:
 *               - cartItemId
 *     responses:
 *       200:
 *         description: Cart item removed or decreased successfully
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
 *                       example: 3
 *                     userId:
 *                       type: integer
 *                       example: 12
 *                     total:
 *                       type: number
 *                       example: 43993
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 6
 *                           quantity:
 *                             type: integer
 *                             example: 2
 *                           price:
 *                             type: number
 *                             example: 6999
 *                           name:
 *                             type: string
 *                             example: "RLX | Luxury Explorer | 16570"
 *                           description:
 *                             type: string
 *                             example: ""
 *                           image:
 *                             type: string
 *                             format: uri
 *                             example: "https://res.cloudinary.com/dxvyc12au/image/upload/v1755502381/products/prod_1755502378837.jpg"
 *                           variantId:
 *                             type: integer
 *                             example: 60
 *                           product:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 35
 *                               name:
 *                                 type: string
 *                                 example: "RLX | Luxury Explorer | 16570"
 *                               description:
 *                                 type: string
 *                                 example: null
 *                               basePrice:
 *                                 type: number
 *                                 example: null
 *                               discount:
 *                                 type: string
 *                                 example: "0.00"
 *                               discountType:
 *                                 type: string
 *                                 example: "PERCENTAGE"
 *                               status:
 *                                 type: string
 *                                 example: "AVAILABLE"
 *                               stock:
 *                                 type: integer
 *                                 example: null
 *                               hasVariants:
 *                                 type: boolean
 *                                 example: true
 *                           variant:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 example: 60
 *                               sku:
 *                                 type: string
 *                                 example: "SKU-GRAY"
 *                               basePrice:
 *                                 type: number
 *                                 example: 6999
 *                               discount:
 *                                 type: string
 *                                 example: "0.00"
 *                               discountType:
 *                                 type: string
 *                                 example: "PERCENTAGE"
 *                               attributes:
 *                                 type: object
 *                                 properties:
 *                                   color:
 *                                     type: string
 *                                     example: "Gray"
 *                               variantImages:
 *                                 type: array
 *                                 items:
 *                                   type: string
 *                                   format: uri
 *                                   example: "https://res.cloudinary.com/dxvyc12au/image/upload/v1755502381/products/prod_1755502378837.jpg"
 *                               stock:
 *                                 type: integer
 *                                 example: 10
 *                               status:
 *                                 type: string
 *                                 example: "AVAILABLE"
 *                               productId:
 *                                 type: integer
 *                                 example: 35
 *       400:
 *         description: Invalid input or cannot decrease quantity below 1
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
 *                   example: "Cannot decrease quantity below 1. Use remove instead."
 *       401:
 *         description: Unauthorized - user not logged in
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
 *         description: Cart or cart item not found
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
 *                   example: "Cart item not found"
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
cartRouter.delete(
    '/',
    authMiddleware,
    validateZod(removeFromCartSchema),
    cartController.removeFromCart.bind(cartController)
);


/**
 * @swagger
 * /api/cart:
 *   get:
 *     summary: Retrieve user's shopping cart
 *     description: Fetches the authenticated user's shopping cart, including all items and their associated product details.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved the user's cart
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates successful retrieval of the cart
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: The user's cart information
 *                   properties:
 *                     id:
 *                       type: integer
 *                       description: Cart's unique identifier
 *                       example: 123
 *                     userId:
 *                       type: integer
 *                       description: ID of the cart owner
 *                       example: 456
 *                     total:
 *                       type: number
 *                       format: decimal
 *                       description: Total price of all items in the cart
 *                       example: 29.98
 *                     items:
 *                       type: array
 *                       description: Array of items in the cart
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             description: Cart item's unique identifier
 *                             example: 789
 *                           quantity:
 *                             type: integer
 *                             description: Number of units of this product
 *                             example: 2
 *                           price:
 *                             type: number
 *                             format: decimal
 *                             description: Price per unit of the product
 *                             example: 14.99
 *                           name:
 *                             type: string
 *                             description: Product name
 *                             example: "Premium Coffee Beans"
 *                           description:
 *                             type: string
 *                             nullable: true
 *                             description: Product description
 *                             example: "Freshly roasted arabica coffee beans"
 *                           image:
 *                             type: string
 *                             nullable: true
 *                             description: Product image URL (first product image if available)
 *                             example: "https://example.com/images/coffee-beans.jpg"
 *                           product:
 *                             type: object
 *                             description: Associated product information
 *                             properties:
 *                               id:
 *                                 type: integer
 *                                 description: Product's unique identifier
 *                                 example: 42
 *                               name:
 *                                 type: string
 *                                 description: Product name
 *                                 example: "Premium Coffee Beans"
 *                               basePrice:
 *                                 type: number
 *                                 format: decimal
 *                                 description: Base price of the product
 *                                 example: 14.99
 *                               stock:
 *                                 type: integer
 *                                 description: Available stock quantity
 *                                 example: 50
 *             example:
 *               success: true
 *               data:
 *                 id: 123
 *                 userId: 456
 *                 total: 29.98
 *                 items:
 *                   - id: 789
 *                     quantity: 2
 *                     price: 14.99
 *                     name: "Premium Coffee Beans"
 *                     description: "Freshly roasted arabica coffee beans"
 *                     image: "https://example.com/images/coffee-beans.jpg"
 *                     product:
 *                       id: 42
 *                       name: "Premium Coffee Beans"
 *                       basePrice: 14.99
 *                       stock: 50
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates authentication failure
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Authentication error message
 *                   example: "Authentication required"
 *       404:
 *         description: Cart not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates resource not found
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message indicating cart not found
 *                   example: "Cart not found"
 *       503:
 *         description: Service temporarily unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates service unavailability
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message indicating service status
 *                   example: "Cart service temporarily unavailable"
 */
cartRouter.get('/', authMiddleware, requireUserRole, cartController.getCart.bind(cartController));

// cartRouter.get("/vendor/cart", authMiddleware, cartController.getCartWithVendor.bind(cartController));

export default cartRouter;