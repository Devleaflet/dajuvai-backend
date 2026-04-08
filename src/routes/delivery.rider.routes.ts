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

/**
 * @swagger
 * /api/rider/delivery/my-assignments:
 *   get:
 *     summary: Get my delivery assignments (Rider only)
 *     description: |
 *       Returns delivery assignments for the authenticated rider.
 *
 *       Legacy alias: `/api/delivery/rider/my-assignments`
 *     tags:
 *       - Delivery Rider
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Assignments fetched successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized (missing/invalid token)
 *       403:
 *         description: Forbidden (requires Rider role)
 *       500:
 *         description: Internal server error
 */
deliveryRiderRouter.get(
    "/my-assignments",
    asyncHandler(
        deliveryRiderController.getRiderAssignments.bind(deliveryRiderController),
    ),
);

/**
 * @swagger
 * /api/rider/delivery/orders/{orderId}/pickup:
 *   patch:
 *     summary: Confirm pickup for an assigned order (Rider only)
 *     description: |
 *       Marks an assignment as picked up for the authenticated rider.
 *
 *       Legacy alias: `/api/delivery/rider/orders/{orderId}/pickup`
 *     tags:
 *       - Delivery Rider
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 101
 *     responses:
 *       200:
 *         description: Pickup confirmed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request (business rule failure)
 *       401:
 *         description: Unauthorized (missing/invalid token)
 *       403:
 *         description: Forbidden (requires Rider role or assignment ownership)
 *       404:
 *         description: Order/assignment not found
 *       500:
 *         description: Internal server error
 */
deliveryRiderRouter.patch(
    "/orders/:orderId/pickup",
    asyncHandler(deliveryRiderController.confirmPickup.bind(deliveryRiderController)),
);

/**
 * @swagger
 * /api/rider/delivery/orders/{orderId}/delivered:
 *   patch:
 *     summary: Mark an order as delivered (Rider only)
 *     description: |
 *       Marks the assignment as delivered for the authenticated rider.
 *
 *       Legacy alias: `/api/delivery/rider/orders/{orderId}/delivered`
 *     tags:
 *       - Delivery Rider
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 101
 *     responses:
 *       200:
 *         description: Order marked delivered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request (business rule failure)
 *       401:
 *         description: Unauthorized (missing/invalid token)
 *       403:
 *         description: Forbidden (requires Rider role or assignment ownership)
 *       404:
 *         description: Order/assignment not found
 *       500:
 *         description: Internal server error
 */
deliveryRiderRouter.patch(
    "/orders/:orderId/delivered",
    asyncHandler(deliveryRiderController.markDelivered.bind(deliveryRiderController)),
);

/**
 * @swagger
 * /api/rider/delivery/orders/{orderId}/failed:
 *   patch:
 *     summary: Mark delivery as failed (Rider only)
 *     description: |
 *       Marks the assignment as failed with a failure reason.
 *
 *       Zod validation: `deliveryFailedSchema` (body)
 *
 *       Legacy alias: `/api/delivery/rider/orders/{orderId}/failed`
 *     tags:
 *       - Delivery Rider
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 101
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - failedReason
 *             properties:
 *               failedReason:
 *                 type: string
 *                 minLength: 1
 *                 example: "Customer unreachable"
 *     responses:
 *       200:
 *         description: Delivery marked failed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request (Zod validation error or business rule failure)
 *       401:
 *         description: Unauthorized (missing/invalid token)
 *       403:
 *         description: Forbidden (requires Rider role or assignment ownership)
 *       404:
 *         description: Order/assignment not found
 *       500:
 *         description: Internal server error
 */
deliveryRiderRouter.patch(
    "/orders/:orderId/failed",
    validateZod(deliveryFailedSchema),
    asyncHandler(
        deliveryRiderController.markDeliveryFailed.bind(deliveryRiderController),
    ),
);

export default deliveryRiderRouter;
