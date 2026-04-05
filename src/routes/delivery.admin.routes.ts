import { Router } from "express";
import {
    authMiddleware,
    isAdmin,
    isAdminOrStaff,
    validateZod,
} from "../middlewares/auth.middleware";

import { asyncHandler } from "../utils/asyncHandler.utils";
import { assignRiderSchema, createRiderSchema, resetRiderPasswordSchema } from "../utils/zod_validations/delivery.zod";
import { DeliveryAdminController } from "../controllers/delivery.admin.controller";

const deliveryAdminRouter = Router();
const deliveryAdminController = new DeliveryAdminController();


deliveryAdminRouter.use(authMiddleware, isAdminOrStaff);

//  RIDER MANAGEMENT

deliveryAdminRouter.post(
    "/riders",
    isAdmin,
    validateZod(createRiderSchema),
    asyncHandler(deliveryAdminController.createRider.bind(deliveryAdminController)),
);

deliveryAdminRouter.get(
    "/riders",
    asyncHandler(deliveryAdminController.getAllRiders.bind(deliveryAdminController)),
);

deliveryAdminRouter.get(
    "/riders/:riderId",
    asyncHandler(deliveryAdminController.getRiderById.bind(deliveryAdminController)),
);

deliveryAdminRouter.put(
    "/riders/:riderId/reset-password",
    isAdmin,
    validateZod(resetRiderPasswordSchema),
    asyncHandler(
        deliveryAdminController.resetRiderPassword.bind(deliveryAdminController),
    ),
);

//  ORDER PROCESSING

deliveryAdminRouter.get(
    "/orders/processing",
    asyncHandler(
        deliveryAdminController.getProcessingOrders.bind(deliveryAdminController),
    ),
);

deliveryAdminRouter.get(
    "/orders/:orderId/processing",
    asyncHandler(
        deliveryAdminController.getProcessingOrderById.bind(deliveryAdminController),
    ),
);

deliveryAdminRouter.patch(
    "/orders/:orderId/returned-warehouse",
    asyncHandler(deliveryAdminController.markAtWarehouse.bind(deliveryAdminController)),
);

deliveryAdminRouter.put(
    "/orders/orderItems/:orderItemId/collect-items",
    asyncHandler(deliveryAdminController.collectOrderItems.bind(deliveryAdminController)),
);

deliveryAdminRouter.get(
    "/warehouse-order-queue",
    asyncHandler(
        deliveryAdminController.getWarehouseOrderQueue.bind(deliveryAdminController),
    ),
);

//  ASSIGNMENTS

deliveryAdminRouter.post(
    "/orders/:orderId/assign-rider",
    validateZod(assignRiderSchema),
    asyncHandler(deliveryAdminController.assignRider.bind(deliveryAdminController)),
);

deliveryAdminRouter.get(
    "/assignments",
    isAdmin,
    asyncHandler(deliveryAdminController.getAllAssignments.bind(deliveryAdminController)),
);

deliveryAdminRouter.get(
    "/orders/:orderId/assignment",
    asyncHandler(
        deliveryAdminController.findOrderAssignment.bind(deliveryAdminController),
    ),
);

deliveryAdminRouter.patch(
    "/orders/:orderId/reset-to-warehouse",
    asyncHandler(
        deliveryAdminController.resetToWarehouse.bind(deliveryAdminController),
    ),
);

export default deliveryAdminRouter;
