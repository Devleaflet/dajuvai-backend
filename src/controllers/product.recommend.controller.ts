import { Response, NextFunction } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { ProductRecommendService } from "../service/product.recommend.service";

export class ProductRecommendController {
    private productRecommendService: ProductRecommendService;

    constructor() {
        this.productRecommendService = new ProductRecommendService();
    }

    getRecommendations() {
        return async (req: AuthRequest, res: Response, _next: NextFunction): Promise<void> => {
            const products = await this.productRecommendService.getRecommendations(req.user?.id);
            res.status(200).json({ success: true, data: products });
        };
    }
}
