
import { Response } from 'express';
import { CartService } from '../service/cart.service';
import { APIError } from '../utils/ApiError.utils';
import { AuthRequest } from '../middlewares/auth.middleware';
import { ICartAddRequest, ICartRemoveRequest } from '../interface/cart.interface';

/**
 * @class CartController
 * @description Controller for managing user cart operations.
 * Handles adding, removing, and fetching cart items.
 */
export class CartController {
    private cartService: CartService;

    /**
     * @constructor
     * @description Initializes a new instance of CartController.
     * Instantiates the CartService for business logic.
     */
    constructor() {
        this.cartService = new CartService();
    }

    /**
     * @method addToCart
     * @description Adds a product to the user's cart.
     * @route POST /api/cart/add
     * @param {AuthRequest<{}, {}, ICartAddRequest>} req - Authenticated request with product ID and quantity
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with updated cart data
     * @throws {APIError} 400 if input is invalid
     * @throws {APIError} 401 if user is not authenticated
     * @throws {APIError} 500 on internal server error
     * @access Authenticated
     */
    async addToCart(req: AuthRequest<{}, {}, ICartAddRequest>, res: Response): Promise<void> {
        try {
            // Validate authenticated user
            const userId = req.user?.id;
            if (!userId) {
                throw new APIError(401, 'Unauthorized');
            }

            // Extract and validate input
            const { productId, quantity } = req.body;
            if (
                typeof productId !== 'number' ||
                !Number.isInteger(productId) ||
                productId <= 0 ||
                typeof quantity !== 'number' ||
                !Number.isInteger(quantity) ||
                quantity <= 0
            ) {
                throw new APIError(400, 'Invalid productId or quantity');
            }

            // Add item to cart via service
            const cart = await this.cartService.addToCart(userId, { productId, quantity });

            // Send success response
            res.status(200).json({ success: true, data: cart });
        } catch (error) {
            // Log error for debugging
            console.error('Error adding to cart:', error);
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @method removeFromCart
     * @description Removes or decreases quantity of a cart item.
     * @route DELETE /api/cart/remove
     * @param {AuthRequest<{}, {}, ICartRemoveRequest>} req - Authenticated request with cart item ID
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with updated cart data
     * @throws {APIError} 400 if cartItemId is invalid
     * @throws {APIError} 401 if user is not authenticated
     * @throws {APIError} 500 on internal server error
     * @access Authenticated
     */
    async removeFromCart(req: AuthRequest<{}, {}, ICartRemoveRequest>, res: Response): Promise<void> {
        try {
            // Validate authenticated user
            const userId = req.user?.id;
            if (!userId) {
                throw new APIError(401, 'Unauthorized');
            }

            // Extract and validate cart item ID
            const { cartItemId } = req.body;
            if (typeof cartItemId !== 'number' || cartItemId <= 0) {
                throw new APIError(400, 'Invalid cartItemId');
            }

            // Remove item from cart via service
            const cart = await this.cartService.removeFromCart(userId, req.body);

            // Send success response
            res.status(200).json({ success: true, data: cart });
        } catch (error) {
            // Log error for debugging
            console.error('Error removing from cart:', error);
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @method getCart
     * @description Fetches the current cart of the user.
     * @route GET /api/cart
     * @param {AuthRequest} req - Authenticated request
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with user's cart data
     * @throws {APIError} 401 if user is not authenticated
     * @throws {APIError} 500 on internal server error
     * @access Authenticated
     */
    async getCart(req: AuthRequest, res: Response): Promise<void> {
        try {
            // Validate authenticated user
            const userId = req.user?.id;
            if (!userId) {
                throw new APIError(401, 'Unauthorized');
            }

            // Fetch cart via service
            const cart = await this.cartService.getCart(userId);

            // Send success response
            res.status(200).json({ success: true, data: cart });
        } catch (error) {
            // Log error for debugging
            console.error('Error getting cart:', error);
            // Handle known API errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }
}