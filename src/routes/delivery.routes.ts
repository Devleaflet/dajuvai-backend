import { Router } from "express";
import {
    authMiddleware,
    isAdmin,
    isAdminOrStaff,
    isRider,
    validateZod,
} from "../middlewares/auth.middleware";

import { asyncHandler } from "../utils/asyncHandler.utils";
import { assignRiderSchema, createRiderSchema, deliveryFailedSchema, resetRiderPasswordSchema } from "../utils/zod_validations/delivery.zod";
import { DeliveryController } from "../controllers/delivery.controller";

const deliveryRouter = Router();
const deliveryController = new DeliveryController();

//  RIDER MANAGEMENT

deliveryRouter.post(
    "/riders",
    authMiddleware,
    isAdmin,
    validateZod(createRiderSchema),
    asyncHandler(deliveryController.createRider.bind(deliveryController)),
);

deliveryRouter.get(
    "/riders",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(deliveryController.getAllRiders.bind(deliveryController)),
);

deliveryRouter.get(
    "/riders/:riderId",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(deliveryController.getRiderById.bind(deliveryController)),
);

deliveryRouter.put(
    "/riders/:riderId/reset-password",
    authMiddleware,
    isAdmin,
    validateZod(resetRiderPasswordSchema),
    asyncHandler(
        deliveryController.resetRiderPassword.bind(deliveryController),
    ),
);

//  ORDER PROCESSING

deliveryRouter.get(
    "/orders/processing",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(
        deliveryController.getProcessingOrders.bind(deliveryController),
    ),
);

deliveryRouter.get(
    "/orders/:orderId/processing",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(
        deliveryController.getProcessingOrderById.bind(deliveryController),
    ),
);

deliveryRouter.patch(
    "/orders/:orderId/returned-warehouse",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(deliveryController.markAtWarehouse.bind(deliveryController)),
);

deliveryRouter.put(
    "/orders/orderItems/:orderItemId/collect-items",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(deliveryController.collectOrderItems.bind(deliveryController)),
);

deliveryRouter.get(
    "/warehouse-order-queue",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(
        deliveryController.getWarehouseOrderQueue.bind(deliveryController),
    ),
);

//  ASSIGNMENTS

deliveryRouter.post(
    "/orders/:orderId/assign-rider",
    authMiddleware,
    isAdminOrStaff,
    validateZod(assignRiderSchema),
    asyncHandler(deliveryController.assignRider.bind(deliveryController)),
);

deliveryRouter.get(
    "/assignments",
    authMiddleware,
    isAdmin,
    asyncHandler(deliveryController.getAllAssignments.bind(deliveryController)),
);

deliveryRouter.get(
    "/orders/:orderId/assignment",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(
        deliveryController.findOrderAssignment.bind(deliveryController),
    ),
);

//  RIDER ACTIONS

deliveryRouter.get(
    "/my-assignments",
    authMiddleware,
    isRider,
    asyncHandler(
        deliveryController.getRiderAssignments.bind(deliveryController),
    ),
);

deliveryRouter.patch(
    "/orders/:orderId/pickup",
    authMiddleware,
    isRider,
    asyncHandler(deliveryController.confirmPickup.bind(deliveryController)),
);

deliveryRouter.patch(
    "/orders/:orderId/delivered",
    authMiddleware,
    isRider,
    asyncHandler(deliveryController.markDelivered.bind(deliveryController)),
);

deliveryRouter.patch(
    "/orders/:orderId/failed",
    authMiddleware,
    isRider,
    validateZod(deliveryFailedSchema),
    asyncHandler(
        deliveryController.markDeliveryFailed.bind(deliveryController),
    ),
);

deliveryRouter.patch(
    "/orders/:orderId/reset-to-warehouse",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(
        deliveryController.resetToWarehouse.bind(deliveryController),
    ),
);

export default deliveryRouter;
