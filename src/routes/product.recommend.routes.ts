import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { ProductRecommendController } from "../controllers/product.recommend.controller";

const productRecommendRouter = Router();
const controller = new ProductRecommendController();

// GET /api/profile/product-recommend
productRecommendRouter.get("/product-recommend", authMiddleware, controller.getRecommendations());

export default productRecommendRouter;