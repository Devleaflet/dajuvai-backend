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
/**
 * @swagger
 * /api/delivery/riders:
 *   post:
 *     summary: Create a new delivery rider
 *     description: Creates a new rider account along with a linked user account. The rider is automatically verified. Requires Admin role.
 *     tags:
 *       - Delivery - Rider Management
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *               - phoneNumber
 *               - password
 *             properties:
 *               fullName:
 *                 type: string
 *                 minLength: 1
 *                 example: "Ram Bahadur"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "ram@example.com"
 *               phoneNumber:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 10
 *                 example: "9800000001"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "securePass123"
 *     responses:
 *       201:
 *         description: Rider created successfully
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
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     fullName:
 *                       type: string
 *                       example: "Ram Bahadur"
 *                     email:
 *                       type: string
 *                       example: "ram@example.com"
 *                     phoneNumber:
 *                       type: string
 *                       example: "9800000001"
 *                     onDelivery:
 *                       type: boolean
 *                       example: false
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Rider with this email already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.post(
    "/riders",
    authMiddleware,
    isAdmin,
    validateZod(createRiderSchema),
    asyncHandler(deliveryController.createRider.bind(deliveryController)),
);

/**
 * @swagger
 * /api/delivery/riders:
 *   get:
 *     summary: Get all delivery riders
 *     description: Returns a list of all registered riders ordered by creation date (newest first). Requires Admin or Staff role.
 *     tags:
 *       - Delivery - Rider Management
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of riders retrieved successfully
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
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       fullName:
 *                         type: string
 *                         example: "Ram Bahadur"
 *                       email:
 *                         type: string
 *                         example: "ram@example.com"
 *                       phoneNumber:
 *                         type: string
 *                         example: "9800000001"
 *                       onDelivery:
 *                         type: boolean
 *                         example: false
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin or Staff role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.get(
    "/riders",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(deliveryController.getAllRiders.bind(deliveryController)),
);

/**
 * @swagger
 * /api/delivery/riders/{riderId}:
 *   get:
 *     summary: Get a rider by ID
 *     description: Returns detailed information about a specific rider including their delivery assignments. Requires Admin or Staff role.
 *     tags:
 *       - Delivery - Rider Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: riderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the rider
 *         example: 1
 *     responses:
 *       200:
 *         description: Rider details retrieved successfully
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
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     fullName:
 *                       type: string
 *                       example: "Ram Bahadur"
 *                     email:
 *                       type: string
 *                       example: "ram@example.com"
 *                     phoneNumber:
 *                       type: string
 *                       example: "9800000001"
 *                     onDelivery:
 *                       type: boolean
 *                       example: false
 *                     assignments:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin or Staff role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Rider not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.get(
    "/riders/:riderId",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(deliveryController.getRiderById.bind(deliveryController)),
);

/**
 * @swagger
 * /api/delivery/riders/{riderId}/reset-password:
 *   put:
 *     summary: Reset a rider's password
 *     description: Resets the password for the user account linked to the specified rider. Requires Admin role.
 *     tags:
 *       - Delivery - Rider Management
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: riderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the rider
 *         example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPassword
 *             properties:
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *                 example: "newSecurePass456"
 *     responses:
 *       200:
 *         description: Password reset successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Password reset successfull"
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Rider not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.put(
    "/riders/:riderId/reset-password",
    authMiddleware,
    isAdmin,
    validateZod(resetRiderPasswordSchema),
    asyncHandler(
        deliveryController.resetRiderPassword.bind(deliveryController),
    ),
);

// ORDER PROCESSING
/**
 * @swagger
 * /api/delivery/orders/processing:
 *   get:
 *     summary: Get all orders in processing status
 *     description: Returns all orders currently in the ORDER_PROCESSING delivery status. Requires Admin or Staff role.
 *     tags:
 *       - Delivery - Order Processing
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Processing orders retrieved successfully
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
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 10
 *                       deliveryStatus:
 *                         type: string
 *                         example: "ORDER_PROCESSING"
 *                       status:
 *                         type: string
 *                         example: "PENDING"
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin or Staff role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.get(
    "/orders/processing",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(
        deliveryController.getProcessingOrders.bind(deliveryController),
    ),
);

/**
 * @swagger
 * /api/delivery/orders/{orderId}/processing:
 *   get:
 *     summary: Get a single processing order by ID
 *     description: Returns detailed information about an order including its items, product, variant, and vendor details. Requires Admin or Staff role.
 *     tags:
 *       - Delivery - Order Processing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the order
 *         example: 10
 *     responses:
 *       200:
 *         description: Order details retrieved successfully
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
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 10
 *                     deliveryStatus:
 *                       type: string
 *                       example: "ORDER_PROCESSING"
 *                     orderItems:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           product:
 *                             type: object
 *                           variant:
 *                             type: object
 *                           vendor:
 *                             type: object
 *                           collectedAtWarehouse:
 *                             type: boolean
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin or Staff role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.get(
    "/orders/:orderId/processing",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(
        deliveryController.getProcessingOrderById.bind(deliveryController),
    ),
);

/**
 * @swagger
 * /api/delivery/orders/{orderId}/returned-warehouse:
 *   patch:
 *     summary: Mark an order as arrived at warehouse
 *     description: Transitions the order delivery status from ORDER_PROCESSING to AT_WAREHOUSE. Requires Admin or Staff role.
 *     tags:
 *       - Delivery - Order Processing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the order
 *         example: 10
 *     responses:
 *       200:
 *         description: Order marked as at warehouse successfully
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
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 10
 *                     deliveryStatus:
 *                       type: string
 *                       example: "AT_WAREHOUSE"
 *       400:
 *         description: Invalid status transition
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin or Staff role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.patch(
    "/orders/:orderId/returned-warehouse",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(deliveryController.markAtWarehouse.bind(deliveryController)),
);

/**
 * @swagger
 * /api/delivery/orders/orderItems/{orderItemId}/collect-items:
 *   put:
 *     summary: Mark an order item as collected at warehouse
 *     description: Marks a specific order item as collected at the warehouse. If all items in the order are collected, the order delivery status automatically transitions to READY_FOR_DELIVERY. Requires Admin or Staff role.
 *     tags:
 *       - Delivery - Order Processing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderItemId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the order item
 *         example: 5
 *     responses:
 *       201:
 *         description: Order item marked as collected successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Order Item Collected"
 *       400:
 *         description: Invalid status transition (all items collected but order cannot transition)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin or Staff role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Order item not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.put(
    "/orders/orderItems/:orderItemId/collect-items",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(deliveryController.collectOrderItems.bind(deliveryController)),
);

/**
 * @swagger
 * /api/delivery/warehouse-order-queue:
 *   get:
 *     summary: Get paginated warehouse order queue
 *     description: Returns a paginated list of orders with READY_FOR_DELIVERY status, ordered by oldest update first (FIFO queue). Includes orderedBy, shippingAddress, orderItems, product, and vendor details. Requires Admin or Staff role.
 *     tags:
 *       - Delivery - Order Processing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of orders per page
 *     responses:
 *       200:
 *         description: Warehouse order queue retrieved successfully
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
 *                   properties:
 *                     orders:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 10
 *                           deliveryStatus:
 *                             type: string
 *                             example: "READY_FOR_DELIVERY"
 *                           orderedBy:
 *                             type: object
 *                           shippingAddress:
 *                             type: object
 *                           orderItems:
 *                             type: array
 *                             items:
 *                               type: object
 *                     total:
 *                       type: integer
 *                       example: 45
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                           example: 1
 *                         totalPages:
 *                           type: integer
 *                           example: 3
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin or Staff role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.get(
    "/warehouse-order-queue",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(
        deliveryController.getWarehouseOrderQueue.bind(deliveryController),
    ),
);

//  ASSIGNMENTS
/**
 * @swagger
 * /api/delivery/orders/{orderId}/assign-rider:
 *   post:
 *     summary: Assign a rider to an order
 *     description: Assigns a delivery rider to an order that is READY_FOR_DELIVERY or AT_WAREHOUSE. The order delivery status transitions to RIDER_ASSIGNED. Will fail if the order already has an active (non-delivered/non-failed) assignment. Requires Admin or Staff role.
 *     tags:
 *       - Delivery - Assignments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the order to assign a rider to
 *         example: 10
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - riderId
 *             properties:
 *               riderId:
 *                 type: integer
 *                 example: 1
 *     responses:
 *       200:
 *         description: Rider assigned successfully
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
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 3
 *                     orderId:
 *                       type: integer
 *                       example: 10
 *                     riderId:
 *                       type: integer
 *                       example: 1
 *                     assignmentStatus:
 *                       type: string
 *                       example: "ASSIGNED"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Order not ready for assignment or already has an active assignment
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin or Staff role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Order or rider not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.post(
    "/orders/:orderId/assign-rider",
    authMiddleware,
    isAdminOrStaff,
    validateZod(assignRiderSchema),
    asyncHandler(deliveryController.assignRider.bind(deliveryController)),
);

/**
 * @swagger
 * /api/delivery/assignments:
 *   get:
 *     summary: Get all delivery assignments (paginated)
 *     description: Returns a paginated list of all delivery assignments with related order and rider data, ordered newest first. Requires Admin role.
 *     tags:
 *       - Delivery - Assignments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of assignments per page
 *     responses:
 *       200:
 *         description: Assignments retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 assignments:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 3
 *                       orderId:
 *                         type: integer
 *                         example: 10
 *                       riderId:
 *                         type: integer
 *                         example: 1
 *                       assignmentStatus:
 *                         type: string
 *                         enum: [ASSIGNED, PICKED_UP, DELIVERED, FAILED]
 *                         example: "ASSIGNED"
 *                       order:
 *                         type: object
 *                       rider:
 *                         type: object
 *                 total:
 *                   type: integer
 *                   example: 100
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     currentPage:
 *                       type: integer
 *                       example: 1
 *                     totalPages:
 *                       type: integer
 *                       example: 5
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.get(
    "/assignments",
    authMiddleware,
    isAdmin,
    asyncHandler(deliveryController.getAllAssignments.bind(deliveryController)),
);

/**
 * @swagger
 * /api/delivery/orders/{orderId}/assignment:
 *   get:
 *     summary: Get the latest assignment for an order
 *     description: Returns the most recent delivery assignment for the specified order, including rider, order, shipping address, order items, and orderedBy details. Requires Admin or Staff role.
 *     tags:
 *       - Delivery - Assignments
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the order
 *         example: 10
 *     responses:
 *       200:
 *         description: Assignment retrieved successfully
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
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 3
 *                     orderId:
 *                       type: integer
 *                       example: 10
 *                     riderId:
 *                       type: integer
 *                       example: 1
 *                     assignmentStatus:
 *                       type: string
 *                       example: "ASSIGNED"
 *                     rider:
 *                       type: object
 *                     order:
 *                       type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin or Staff role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: No assignment found for this order
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.get(
    "/orders/:orderId/assignment",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(
        deliveryController.findOrderAssignment.bind(deliveryController),
    ),
);

//  RIDER ACTIONS
/**
 * @swagger
 * /api/delivery/my-assignments:
 *   get:
 *     summary: Get the authenticated rider's assignments
 *     description: Returns all delivery assignments for the currently authenticated rider, including order, shipping address, and customer details, ordered newest first. Requires Rider role.
 *     tags:
 *       - Delivery - Rider Actions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Rider assignments retrieved successfully
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
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 3
 *                       assignmentStatus:
 *                         type: string
 *                         enum: [ASSIGNED, PICKED_UP, DELIVERED, FAILED]
 *                         example: "ASSIGNED"
 *                       order:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                           shippingAddress:
 *                             type: object
 *                           orderedBy:
 *                             type: object
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Rider role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.get(
    "/my-assignments",
    authMiddleware,
    isRider,
    asyncHandler(
        deliveryController.getRiderAssignments.bind(deliveryController),
    ),
);

/**
 * @swagger
 * /api/delivery/orders/{orderId}/pickup:
 *   patch:
 *     summary: Confirm order pickup by rider
 *     description: The authenticated rider confirms they have picked up the order. Transitions order delivery status from RIDER_ASSIGNED to OUT_FOR_DELIVERY and order status to SHIPPED. Updates the assignment status to PICKED_UP and sets the rider's onDelivery flag to true. Requires Rider role.
 *     tags:
 *       - Delivery - Rider Actions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the order to confirm pickup for
 *         example: 10
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
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 3
 *                     assignmentStatus:
 *                       type: string
 *                       example: "PICKED_UP"
 *                     pickedUpAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Assignment is not in ASSIGNED status or invalid status transition
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Rider role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Order not found or rider not assigned to this order
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.patch(
    "/orders/:orderId/pickup",
    authMiddleware,
    isRider,
    asyncHandler(deliveryController.confirmPickup.bind(deliveryController)),
);

/**
 * @swagger
 * /api/delivery/orders/{orderId}/delivered:
 *   patch:
 *     summary: Mark an order as delivered
 *     description: The authenticated rider marks the order as successfully delivered. Transitions order delivery status to DELIVERED and order status to DELIVERED. Updates the assignment status to DELIVERED and sets the rider's onDelivery flag to false. The assignment must currently be in PICKED_UP status. Requires Rider role.
 *     tags:
 *       - Delivery - Rider Actions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the order to mark as delivered
 *         example: 10
 *     responses:
 *       200:
 *         description: Order marked as delivered successfully
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
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 3
 *                     assignmentStatus:
 *                       type: string
 *                       example: "DELIVERED"
 *                     deliveredAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid status transition
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Rider role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Order not found or no active pickup found for this rider
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.patch(
    "/orders/:orderId/delivered",
    authMiddleware,
    isRider,
    asyncHandler(deliveryController.markDelivered.bind(deliveryController)),
);

/**
 * @swagger
 * /api/delivery/orders/{orderId}/failed:
 *   patch:
 *     summary: Mark a delivery as failed
 *     description: The authenticated rider reports that a delivery attempt has failed, providing a reason. Transitions order delivery status to DELIVERY_FAILED. Updates the assignment status to FAILED and stores the failure reason. Sets the rider's onDelivery flag to false. The assignment must currently be in PICKED_UP status. Requires Rider role.
 *     tags:
 *       - Delivery - Rider Actions
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the order for which delivery failed
 *         example: 10
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
 *                 example: "Customer was not available at the address"
 *     responses:
 *       200:
 *         description: Delivery marked as failed successfully
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
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 3
 *                     assignmentStatus:
 *                       type: string
 *                       example: "FAILED"
 *                     failureReason:
 *                       type: string
 *                       example: "Customer was not available at the address"
 *       400:
 *         description: Validation error or invalid status transition
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Rider role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Order not found or no active pickup found for this rider
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.patch(
    "/orders/:orderId/failed",
    authMiddleware,
    isRider,
    validateZod(deliveryFailedSchema),
    asyncHandler(
        deliveryController.markDeliveryFailed.bind(deliveryController),
    ),
);

/**
 * @swagger
 * /api/delivery/orders/{orderId}/reset-to-warehouse:
 *   patch:
 *     summary: Reset a failed delivery back to warehouse
 *     description: Re-routes an order that had a failed delivery back into the AT_WAREHOUSE state and marks the order status as RETURNED. This allows the order to be re-assigned to a rider. Requires Admin or Staff role.
 *     tags:
 *       - Delivery - Order Processing
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: orderId
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the order to reset to warehouse
 *         example: 10
 *     responses:
 *       200:
 *         description: Order reset to warehouse successfully
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
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 10
 *                     deliveryStatus:
 *                       type: string
 *                       example: "AT_WAREHOUSE"
 *                     status:
 *                       type: string
 *                       example: "RETURNED"
 *       400:
 *         description: Invalid status transition
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       403:
 *         description: Forbidden - Admin or Staff role required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Order not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
deliveryRouter.patch(
    "/orders/:orderId/reset-to-warehouse",
    authMiddleware,
    isAdminOrStaff,
    asyncHandler(
        deliveryController.resetToWarehouse.bind(deliveryController),
    ),
);

export default deliveryRouter;
