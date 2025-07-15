import { Router } from 'express';

import { authMiddleware, isAccountOwner, validateZod } from '../middlewares/auth.middleware';
import { addToCartSchema, removeFromCartSchema } from '../utils/zod_validations/cart.zod';
import { CartController } from '../controllers/cart.controller';

const cartRouter = Router();
const cartController = new CartController();

/**
 * @swagger
 * /api/cart:
 *   post:
 *     summary: Add product to shopping cart
 *     description: Adds a product to the authenticated user's shopping cart. If the product already exists in the cart, updates the quantity. Creates a new cart if the user doesn't have one.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *               - quantity
 *             properties:
 *               productId:
 *                 type: integer
 *                 minimum: 1
 *                 description: Unique identifier of the product to add to cart (required, positive integer)
 *                 example: 42
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 description: Number of units to add to cart (required, positive integer)
 *                 example: 2
 *           example:
 *             productId: 42
 *             quantity: 2
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
 *                   description: Indicates successful addition to cart
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: Updated cart information with items
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
 *                       description: Total price of all items in cart
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
 *                 items: [
 *                   {
 *                     id: 789,
 *                     quantity: 2,
 *                     price: 14.99,
 *                     name: "Premium Coffee Beans",
 *                     description: "Freshly roasted arabica coffee beans",
 *                     image: "https://example.com/images/coffee-beans.jpg",
 *                     product: {
 *                       id: 42,
 *                       name: "Premium Coffee Beans",
 *                       basePrice: 14.99,
 *                       stock: 50
 *                     }
 *                   }
 *                 ]
 *       400:
 *         description: Invalid input data, validation errors, or insufficient stock
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       description: Indicates request failure
 *                       example: false
 *                     errors:
 *                       type: array
 *                       description: Array of validation errors from Zod schema
 *                       items:
 *                         type: object
 *                         properties:
 *                           path:
 *                             type: array
 *                             description: Field path that failed validation
 *                           message:
 *                             type: string
 *                             description: Validation error message
 *                 - type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       description: Indicates request failure
 *                       example: false
 *                     message:
 *                       type: string
 *                       description: Error message for specific business logic failure
 *             examples:
 *               validationErrors:
 *                 summary: Zod validation errors
 *                 value:
 *                   success: false
 *                   errors: [
 *                     {
 *                       "path": ["quantity"],
 *                       "message": "Quantity must be a positive integer"
 *                     }
 *                   ]
 *               insufficientStock:
 *                 summary: Insufficient product stock
 *                 value:
 *                   success: false
 *                   message: "Insufficient stock"
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
 *             example:
 *               success: false
 *               message: "Authentication required"
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates product not found
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message indicating product not found
 *                   example: "Product not found"
 *             example:
 *               success: false
 *               message: "Product not found"
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
 *             example:
 *               success: false
 *               message: "Cart service temporarily unavailable"
 */
cartRouter.post('/', authMiddleware, validateZod(addToCartSchema), cartController.addToCart.bind(cartController));

/**
 * @swagger
 * /api/cart:
 *   delete:
 *     summary: Remove item from shopping cart
 *     description: Removes a specified item from the authenticated user's shopping cart and updates the cart's total. Requires a valid cart item ID.
 *     tags: [Cart]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cartItemId
 *             properties:
 *               cartItemId:
 *                 type: integer
 *                 minimum: 1
 *                 description: Unique identifier of the cart item to remove (required, positive integer)
 *                 example: 789
 *           example:
 *             cartItemId: 789
 *     responses:
 *       200:
 *         description: Item successfully removed from cart
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates successful removal from cart
 *                   example: true
 *                 data:
 *                   type: object
 *                   description: Updated cart information after removal
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
 *                       description: Total price of all remaining items in cart
 *                       example: 14.99
 *                     items:
 *                       type: array
 *                       description: Array of remaining items in the cart
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             description: Cart item's unique identifier
 *                             example: 790
 *                           quantity:
 *                             type: integer
 *                             description: Number of units of this product
 *                             example: 1
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
 *             example:
 *               success: true
 *               data:
 *                 id: 123
 *                 userId: 456
 *                 total: 14.99
 *                 items:
 *                   - id: 790
 *                     quantity: 1
 *                     price: 14.99
 *                     name: "Premium Coffee Beans"
 *                     description: "Freshly roasted arabica coffee beans"
 *                     image: "https://example.com/images/coffee-beans.jpg"
 *       400:
 *         description: Invalid input data or validation errors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates request failure
 *                   example: false
 *                 errors:
 *                   type: array
 *                   description: Array of validation errors from Zod schema
 *                   items:
 *                     type: object
 *                     properties:
 *                       path:
 *                         type: array
 *                         description: Field path that failed validation
 *                       message:
 *                         type: string
 *                         description: Validation error message
 *             example:
 *               success: false
 *               errors:
 *                 - path: ["cartItemId"]
 *                   message: "Cart item ID must be a positive integer"
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
 *         description: Cart or cart item not found
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
 *                   description: Error message indicating resource not found
 *                   example: "Cart not found"
 *             examples:
 *               cartNotFound:
 *                 summary: Cart not found
 *                 value:
 *                   success: false
 *                   message: "Cart not found"
 *               cartItemNotFound:
 *                 summary: Cart item not found
 *                 value:
 *                   success: false
 *                   message: "Cart item not found"
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
 *             example:
 *               success: false
 *               message: "Cart service temporarily unavailable"
 */
cartRouter.delete('/', authMiddleware, validateZod(removeFromCartSchema), cartController.removeFromCart.bind(cartController));

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
cartRouter.get('/', authMiddleware, cartController.getCart.bind(cartController));

// cartRouter.get("/vendor/cart", authMiddleware, cartController.getCartWithVendor.bind(cartController));

export default cartRouter;