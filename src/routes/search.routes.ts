import { Router } from "express";
import rateLimit from "express-rate-limit";
import AppDataSource from "../config/db.config";
import { SearchController } from "../controllers/search.controller";
import { SearchService } from "../service/search.service";
import { asyncHandler } from "../utils/asyncHandler.utils";

const router = Router();
const controller = new SearchController(new SearchService(AppDataSource));

const suggestionRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 90,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { success: false, message: "Too many search requests. Please try again shortly." },
});

router.get("/suggestions", suggestionRateLimiter, asyncHandler(controller.getSuggestions.bind(controller)));

export default router;
