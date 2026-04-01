import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { ProductRecommendService } from "../service/product.recommend.service";
import { APIError } from "../utils/ApiError.utils";

export class ProductRecommendController {
    private productRecommendService: ProductRecommendService;

    constructor() {
        this.productRecommendService = new ProductRecommendService();
    }

    getRecommendations() {
        return async (req: AuthRequest, res: Response): Promise<void> => {
            try {
                const userId = req.user?.id;
                if (!userId) throw new APIError(401, "Unauthorized");

                const products = await this.productRecommendService.getRecommendations(userId);
                res.status(200).json({ success: true, data: products });
            } catch (error) {
                if (error instanceof APIError) {
                    res.status(error.status).json({ success: false, message: error.message });
                } else {
                    res.status(500).json({ success: false, message: "Internal server error" });
                }
            }
        };
    }
}