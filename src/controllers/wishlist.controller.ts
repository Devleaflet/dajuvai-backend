import { Response } from 'express';
import { IWishlistAddRequest, IWishlistRemoveRequest, IWishlistMoveToCartRequest } from '../interface/wishlist.interface';
import { AuthRequest } from '../middlewares/auth.middleware';
import { WishlistService } from '../service/wishlist.service';
import { APIError } from '../utils/ApiError.utils';

/**
 * @class WishlistController
 * @description Controller for handling wishlist-related requests.
 */
export class WishlistController {
    private wishlistService: WishlistService;

    constructor() {
        this.wishlistService = new WishlistService();
    }

    /**
     * @method addToWishlist
     * @description Adds a product to the authenticated user's wishlist.
     * @param {AuthRequest<{}, {}, IWishlistAddRequest>} req - Authenticated request with body containing productId
     * @param {Response} res - Express response object
     * @returns {Promise<void>} On success, responds with status 200 and the updated wishlist.
     * @throws {APIError} 400 if productId is missing, 401 if user not authenticated.
     * @throws {APIError} 500 on internal server errors.
     * @access Customer
     */
    async addToWishlist(req: AuthRequest<{}, {}, IWishlistAddRequest>, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) throw new APIError(401, 'Unauthorized');

            const { productId } = req.body;
            if (!productId) throw new APIError(400, 'Product ID is required');

            const wishlist = await this.wishlistService.addToWishlist(userId, req.body);
            res.status(200).json({ success: true, data: wishlist });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @method removeFromWishlist
     * @description Removes a product from the authenticated user's wishlist.
     * @param {AuthRequest<{}, {}, IWishlistRemoveRequest>} req - Authenticated request with body containing wishlistItemId
     * @param {Response} res - Express response object
     * @returns {Promise<void>} On success, responds with status 200 and the updated wishlist.
     * @throws {APIError} 400 if wishlistItemId is invalid or missing, 401 if user not authenticated.
     * @throws {APIError} 500 on internal server errors.
     * @access Customer
     */
    async removeFromWishlist(req: AuthRequest<{}, {}, IWishlistRemoveRequest>, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) throw new APIError(401, 'Unauthorized');

            const { wishlistItemId } = req.body;
            if (!wishlistItemId || isNaN(wishlistItemId) || wishlistItemId <= 0) {
                throw new APIError(400, 'Valid Wishlist Item ID is required');
            }

            const wishlist = await this.wishlistService.removeFromWishlist(userId, req.body);
            res.status(200).json({ success: true, data: wishlist });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }


    /**
     * @method getWishlist
     * @description Retrieves the wishlist for the authenticated user.
     * @param {AuthRequest} req - Authenticated request containing user information
     * @param {Response} res - Express response object
     * @returns {Promise<void>} On success, responds with status 200 and wishlist data (empty if none).
     * @throws {APIError} 401 if user not authenticated.
     * @throws {APIError} 500 on internal server errors.
     * @access Customer
     */
    async getWishlist(req: AuthRequest, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) throw new APIError(401, 'Unauthorized');

            const wishlist = await this.wishlistService.getWishlist(userId);
            res.status(200).json({ success: true, data: wishlist || { items: [] } });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
      * @method moveToCart
      * @description Moves a wishlist item to the user's cart.
      * @param {AuthRequest<{}, {}, IWishlistMoveToCartRequest>} req - Authenticated request with body containing the wishlist item to move
      * @param {Response} res - Express response object
      * @returns {Promise<void>} On success, responds with status 200 and updated wishlist/cart data.
      * @throws {APIError} 401 if user not authenticated.
      * @throws {APIError} 500 on internal server errors.
      * @access Customer
      */
    async moveToCart(req: AuthRequest<{}, {}, IWishlistMoveToCartRequest>, res: Response): Promise<void> {
        try {
            const userId = req.user?.id;
            if (!userId) throw new APIError(401, 'Unauthorized');

            const wishlist = await this.wishlistService.moveToCart(userId, req.body);
            res.status(200).json({ success: true, data: wishlist });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }
}