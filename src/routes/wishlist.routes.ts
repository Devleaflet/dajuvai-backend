import { Router } from 'express';
import { WishlistController } from '../controllers/wishlist.controller';
import { authMiddleware, validateZod } from '../middlewares/auth.middleware';
import { addToWishlistSchema, removeFromWishlistSchema, moveToCartSchema } from '../utils/zod_validations/wishlist.zod';

const router = Router();
const wishlistController = new WishlistController();

/**
 * @swagger
 * /api/wishlist:
 *   post:
 *     summary: Add a product to the authenticated user's wishlist
 *     description: Adds the specified product to the wishlist of the authenticated user. Returns the updated wishlist.
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Product ID to add to wishlist
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productId
 *             properties:
 *               productId:
 *                 type: integer
 *                 example: 123
 *                 description: The ID of the product to add
 *     responses:
 *       200:
 *         description: Product successfully added to wishlist
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
 *                   description: The updated wishlist object
 *       400:
 *         description: Bad request (e.g., product already in wishlist or missing productId)
 *       401:
 *         description: Unauthorized (user not authenticated)
 *       404:
 *         description: Product not found
 *       500:
 *         description: Internal server error
 */

router.post('/', authMiddleware, validateZod(addToWishlistSchema), wishlistController.addToWishlist.bind(wishlistController));

/**
 * @swagger
 * /api/wishlist:
 *   delete:
 *     summary: Remove an item from the authenticated user's wishlist
 *     description: Deletes the specified wishlist item from the wishlist of the authenticated user. Returns the updated wishlist.
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Wishlist item ID to remove
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - wishlistItemId
 *             properties:
 *               wishlistItemId:
 *                 type: integer
 *                 example: 456
 *                 description: The ID of the wishlist item to remove
 *     responses:
 *       200:
 *         description: Wishlist item successfully removed
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
 *                   description: The updated wishlist object
 *       404:
 *         description: Wishlist or wishlist item not found
 *       401:
 *         description: Unauthorized (user not authenticated)
 *       400:
 *         description: Bad request (e.g., invalid wishlistItemId)
 *       500:
 *         description: Internal server error
 */

router.delete('/', authMiddleware, validateZod(removeFromWishlistSchema), wishlistController.removeFromWishlist.bind(wishlistController));

/**
 * @swagger
 * /api/wishlist:
 *   get:
 *     summary: Get the authenticated user's wishlist with product details
 *     description: Retrieves the wishlist of the authenticated user including the products in it.
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User wishlist retrieved successfully
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
 *                     items:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             description: Wishlist item ID
 *                           productId:
 *                             type: integer
 *                           product:
 *                             type: object
 *                             description: Product details
 *                             properties:
 *                               id:
 *                                 type: integer
 *                               name:
 *                                 type: string
 *                               description:
 *                                 type: string
 *                               basePrice:
 *                                 type: number
 *       401:
 *         description: Unauthorized - user not authenticated
 *       500:
 *         description: Internal server error
 */
router.get('/', authMiddleware, wishlistController.getWishlist.bind(wishlistController));

/**
 * @swagger
 * /api/wishlist/move-to-cart:
 *   post:
 *     summary: Move a product from wishlist to cart
 *     description: Moves an item from the authenticated user's wishlist to their cart with specified quantity.
 *     tags: [Wishlist]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: Wishlist item ID and quantity to move to cart
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - wishlistItemId
 *               - quantity
 *             properties:
 *               wishlistItemId:
 *                 type: integer
 *                 example: 123
 *                 description: The ID of the wishlist item to move
 *               quantity:
 *                 type: integer
 *                 example: 2
 *                 description: Quantity to move to cart
 *     responses:
 *       200:
 *         description: Wishlist item moved to cart successfully, returning updated wishlist
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
 *                   description: Updated wishlist object
 *       400:
 *         description: Bad request (invalid input)
 *       401:
 *         description: Unauthorized (user not authenticated)
 *       404:
 *         description: Wishlist or wishlist item not found
 *       500:
 *         description: Internal server error
 */
router.post('/move-to-cart', authMiddleware, validateZod(moveToCartSchema), wishlistController.moveToCart.bind(wishlistController));

export default router;