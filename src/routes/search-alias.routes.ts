import { Router } from "express";
import { SearchAliasController } from "../controllers/search-alias.controller";
import { authMiddleware, isAdmin } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler.utils";

const router = Router();
const controller = new SearchAliasController();

router.get("/", authMiddleware, isAdmin, asyncHandler(controller.list.bind(controller)));
router.post("/:id/approve", authMiddleware, isAdmin, asyncHandler(controller.approve.bind(controller)));
router.post("/:id/disable", authMiddleware, isAdmin, asyncHandler(controller.disable.bind(controller)));

export default router;
