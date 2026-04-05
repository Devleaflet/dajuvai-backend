import { Router } from "express";
import {
    authMiddleware,
    isRider,
    validateZod,
} from "../middlewares/auth.middleware";

import { asyncHandler } from "../utils/asyncHandler.utils";
import { deliveryFailedSchema } from "../utils/zod_validations/delivery.zod";
import { DeliveryRiderController } from "../controllers/delivery.rider.controller";

const deliveryRiderRouter = Router();
const deliveryRiderController = new DeliveryRiderController();

deliveryRiderRouter.use(authMiddleware, isRider);

//  RIDER ACTIONS

deliveryRiderRouter.get(
    "/my-assignments",
    asyncHandler(
        deliveryRiderController.getRiderAssignments.bind(deliveryRiderController),
    ),
);

deliveryRiderRouter.patch(
    "/orders/:orderId/pickup",
    asyncHandler(deliveryRiderController.confirmPickup.bind(deliveryRiderController)),
);

deliveryRiderRouter.patch(
    "/orders/:orderId/delivered",
    asyncHandler(deliveryRiderController.markDelivered.bind(deliveryRiderController)),
);

deliveryRiderRouter.patch(
    "/orders/:orderId/failed",
    validateZod(deliveryFailedSchema),
    asyncHandler(
        deliveryRiderController.markDeliveryFailed.bind(deliveryRiderController),
    ),
);

export default deliveryRiderRouter;
