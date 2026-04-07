import { Response, NextFunction } from "express";
import { IWishlistAddRequest, IWishlistRemoveRequest, IWishlistMoveToCartRequest } from "../interface/wishlist.interface";
import { AuthRequest } from "../middlewares/auth.middleware";
import { WishlistService } from "../service/wishlist.service";

export class WishlistController {
    private wishlistService: WishlistService;

    constructor() {
        this.wishlistService = new WishlistService();
    }

    async addToWishlist(req: AuthRequest<{}, {}, IWishlistAddRequest>, res: Response, _next: NextFunction): Promise<void> {
        const wishlist = await this.wishlistService.addToWishlist(req.user?.id, req.body);
        res.status(200).json({ success: true, data: wishlist });
    }

    async removeFromWishlist(req: AuthRequest<{}, {}, IWishlistRemoveRequest>, res: Response, _next: NextFunction): Promise<void> {
        const wishlist = await this.wishlistService.removeFromWishlist(req.user?.id, req.body);
        res.status(200).json({ success: true, data: wishlist });
    }

    async getWishlist(req: AuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const wishlist = await this.wishlistService.getWishlist(req.user?.id);
        res.status(200).json({ success: true, data: wishlist || { items: [] } });
    }

    async moveToCart(req: AuthRequest<{}, {}, IWishlistMoveToCartRequest>, res: Response, _next: NextFunction): Promise<void> {
        const wishlist = await this.wishlistService.moveToCart(req.user?.id, req.body);
        res.status(200).json({ success: true, data: wishlist });
    }
}
