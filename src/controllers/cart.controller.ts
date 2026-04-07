import { Response, NextFunction } from "express";
import { CartService } from "../service/cart.service";
import { AuthRequest } from "../middlewares/auth.middleware";
import { ICartAddRequest, ICartRemoveRequest } from "../interface/cart.interface";
import { emitCartUpdate } from "../socket/socket";

export class CartController {
    private cartService: CartService;

    constructor() {
        this.cartService = new CartService();
    }

    async addToCart(req: AuthRequest<{}, {}, ICartAddRequest>, res: Response, _next: NextFunction): Promise<void> {
        const userId = req.user?.id;
        const { productId, quantity, variantId } = req.body;
        const cart = await this.cartService.addToCart(userId, { productId, quantity, variantId });
        emitCartUpdate(userId, cart);
        res.status(200).json({ success: true, data: cart });
    }

    async removeFromCart(req: AuthRequest<{}, {}, ICartRemoveRequest>, res: Response, _next: NextFunction): Promise<void> {
        const userId = req.user?.id;
        const cart = await this.cartService.removeFromCart(userId, req.body);
        emitCartUpdate(userId, cart);
        res.status(200).json({ success: true, data: cart });
    }

    async getCart(req: AuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const userId = req.user?.id;
        const cart = await this.cartService.getCart(userId);
        res.status(200).json({ success: true, data: cart });
    }
}
