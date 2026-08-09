import { Router } from "express";
import {
    authMiddleware,
    isAdmin,
    isAdminOrStaff,
    validateZod,
} from "../middlewares/auth.middleware";
import { checkPermission } from "../middlewares/permission.middleware";
import { ModuleName, PermissionLevel } from "../entities/permission.enum";

import { asyncHandler } from "../utils/asyncHandler.utils";
import { assignRiderSchema, bulkAssignRiderSchema, createRiderSchema, resetRiderPasswordSchema } from "../utils/zod_validations/delivery.zod";
import { DeliveryAdminController } from "../controllers/delivery.admin.controller";

const deliveryAdminRouter = Router();
const deliveryAdminController = new DeliveryAdminController();


deliveryAdminRouter.use(authMiddleware, isAdminOrStaff);

//  RIDER MANAGEMENT

/**
 * @swagger
 * /api/admin/delivery/riders:
 *   post:
 *     summary: Create a delivery rider (Admin only)
 *     description: |
 *       Creates a new Rider user + Rider profile.
 *
 *       Zod validation: `createRiderSchema` (body)
 *
 *       Legacy alias: `/api/delivery/admin/riders`
 *     tags:
 *       - Delivery Admin
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
 *               - documentUrl
 *             properties:
 *               fullName:
 *                 type: string
 *                 minLength: 1
 *                 example: "Sita Sharma"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "rider1@dajuvai.com"
 *               phoneNumber:
 *                 type: string
 *                 minLength: 10
 *                 maxLength: 10
 *                 example: "9812345678"
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 example: "StrongPass123"
 *               documentUrl:
 *                 type: string
 *                 format: uri
 *                 example: "https://cdn.dajuvai.com/uploads/riders/documents/abc.jpg"
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
 *                   description: Rider entity
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 12
 *                     fullName:
 *                       type: string
 *                       example: "Sita Sharma"
 *                     phoneNumber:
 *                       type: string
 *                       example: "9812345678"
 *                     email:
 *                       type: string
 *                       example: "rider1@dajuvai.com"
 *                     onDelivery:
 *                       type: boolean
 *                       example: false
 *                     userId:
 *                       type: integer
 *                       example: 99
 *                     documentUrl:
 *                       type: string
 *                       example: "https://cdn.dajuvai.com/uploads/riders/documents/abc.jpg"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request (Zod validation error)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 errorCode:
 *                   type: string
 *                   example: "VALIDATION_ERROR"
 *                 message:
 *                   type: string
 *                   example: "Validation failed"
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       field:
 *                         type: string
 *                         example: "email"
 *                       message:
 *                         type: string
 *                         example: "invalid email"
 *       401:
 *         description: Unauthorized (missing/invalid token)
 *       403:
 *         description: Forbidden (requires Admin role)
 *       409:
 *         description: Conflict (rider with email already exists)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "rider with this email already exists"
 *       500:
 *         description: Internal server error
 */
deliveryAdminRouter.post(
    "/riders",
    isAdmin,
    checkPermission(ModuleName.DELIVERY, PermissionLevel.CREATE_EDIT),
    validateZod(createRiderSchema),
    asyncHandler(deliveryAdminController.createRider.bind(deliveryAdminController)),
);

/**
 * @swagger
 * /api/admin/delivery/riders:
 *   get:
 *     summary: Get all delivery riders
 *     description: |
 *       Returns riders ordered by newest first.
 *
 *       Legacy alias: `/api/delivery/admin/riders`
 *     tags:
 *       - Delivery Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Riders fetched successfully
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
 *                     $ref: '#/components/schemas/DeliveryRider'
 *       401:
 *         description: Unauthorized (missing/invalid token)
 *       403:
 *         description: Forbidden (requires Admin or Staff)
 *       500:
 *         description: Internal server error
 */
deliveryAdminRouter.get(
    "/riders",
    checkPermission(ModuleName.DELIVERY, PermissionLevel.VIEW),
    asyncHandler(deliveryAdminController.getAllRiders.bind(deliveryAdminController)),
);

/**
 * @swagger
 * /api/admin/delivery/riders/{riderId}:
 *   get:
 *     summary: Get a delivery rider by ID
 *     description: |
 *       Legacy alias: `/api/delivery/admin/riders/{riderId}`
 *     tags:
 *       - Delivery Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: riderId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 12
 *     responses:
 *       200:
 *         description: Rider fetched successfully
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
 *                       example: 12
 *                     fullName:
 *                       type: string
 *                       example: "Sita Sharma"
 *                     email:
 *                       type: string
 *                       example: "rider1@dajuvai.com"
 *                     onDelivery:
 *                       type: boolean
 *                       example: false
 *       401:
 *         description: Unauthorized (missing/invalid token)
 *       403:
 *         description: Forbidden (requires Admin or Staff)
 *       404:
 *         description: Rider not found
 *       500:
 *         description: Internal server error
 */
deliveryAdminRouter.get(
    "/riders/:riderId",
    checkPermission(ModuleName.DELIVERY, PermissionLevel.VIEW),
    asyncHandler(deliveryAdminController.getRiderById.bind(deliveryAdminController)),
);

/**
 * @swagger
 * /api/admin/delivery/riders/{riderId}/reset-password:
 *   put:
 *     summary: Reset a rider password (Admin only)
 *     description: |
 *       Resets the password of the User account linked to the Rider.
 *
 *       Zod validation: `resetRiderPasswordSchema` (body)
 *
 *       Legacy alias: `/api/delivery/admin/riders/{riderId}/reset-password`
 *     tags:
 *       - Delivery Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: riderId
 *         required: true
 *         schema:
 *           type: integer
 *         example: 12
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
 *                 example: "NewStrongPass123"
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
 *         description: Bad request (Zod validation error)
 *       401:
 *         description: Unauthorized (missing/invalid token)
 *       403:
 *         description: Forbidden (requires Admin role)
 *       404:
 *         description: Rider or linked user not found
 *       500:
 *         description: Internal server error
 */
deliveryAdminRouter.put(
    "/riders/:riderId/reset-password",
    isAdmin,
    checkPermission(ModuleName.DELIVERY, PermissionLevel.CREATE_EDIT),
    validateZod(resetRiderPasswordSchema),
    asyncHandler(
        deliveryAdminController.resetRiderPassword.bind(deliveryAdminController),
    ),
);

//  ALL ORDERS (AT_WAREHOUSE)

/**
 * @swagger
 * /api/admin/delivery/orders/at-warehouse:
 *   get:
 *     summary: Get all orders at warehouse (status = ARRIVED_AT_WAREHOUSE)
 *     description: |
 *       Returns paginated orders whose status is ARRIVED_AT_WAREHOUSE for delivery management.
 *       Supports search by order number, customer name, vendor name, and sorting by newest/oldest.
 *     tags:
 *       - Delivery Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           enum: [newest, oldest]
 *           default: newest
 *     responses:
 *       200:
 *         description: Orders fetched successfully
 */
deliveryAdminRouter.get(
    "/orders/at-warehouse",
    checkPermission(ModuleName.DELIVERY, PermissionLevel.VIEW),
    asyncHandler(
        deliveryAdminController.getAtWarehouseOrders.bind(deliveryAdminController),
    ),
);

/**
 * @swagger
 * /api/admin/delivery/orders/bulk-assign:
 *   post:
 *     summary: Bulk assign a rider to multiple orders
 *     tags:
 *       - Delivery Admin
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orderIds
 *               - riderId
 *             properties:
 *               orderIds:
 *                 type: array
 *                 items:
 *                   type: integer
 *               riderId:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Bulk assignment completed
 */
deliveryAdminRouter.post(
    "/orders/bulk-assign",
    checkPermission(ModuleName.DELIVERY, PermissionLevel.CREATE_EDIT),
    validateZod(bulkAssignRiderSchema),
    asyncHandler(deliveryAdminController.bulkAssignRider.bind(deliveryAdminController)),
);

//  ASSIGNMENTS

/**
 * @swagger
 * /api/admin/delivery/orders/{orderId}/assign-rider:
 *   post:
 *     summary: Assign a rider to an order
 *     description: |
 *       Creates a delivery assignment for the order and transitions the order
 *       deliveryStatus to `RIDER_ASSIGNED` (if allowed).
 *
 *       Zod validation: `assignRiderSchema` (body)
 *
 *       Legacy alias: `/api/delivery/admin/orders/{orderId}/assign-rider`
 *     tags:
 *       - Delivery Admin
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
 *               - riderId
 *             properties:
 *               riderId:
 *                 type: integer
 *                 example: 12
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
 *                   description: Delivery assignment
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 9001
 *                     orderId:
 *                       type: integer
 *                       example: 101
 *                     riderId:
 *                       type: integer
 *                       example: 12
 *                     assignmentStatus:
 *                       type: string
 *                       example: "assigned"
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request (Zod validation error or business rule failure)
 *       401:
 *         description: Unauthorized (missing/invalid token)
 *       403:
 *         description: Forbidden (requires Admin or Staff)
 *       404:
 *         description: Order or rider not found
 *       500:
 *         description: Internal server error
 */
deliveryAdminRouter.post(
    "/orders/:orderId/assign-rider",
    checkPermission(ModuleName.DELIVERY, PermissionLevel.CREATE_EDIT),
    validateZod(assignRiderSchema),
    asyncHandler(deliveryAdminController.assignRider.bind(deliveryAdminController)),
);

/**
 * @swagger
 * /api/admin/delivery/assignments:
 *   get:
 *     summary: Get all delivery assignments (Admin only)
 *     description: |
 *       Returns paginated delivery assignments with `order` and `rider` relations.
 *
 *       Legacy alias: `/api/delivery/admin/assignments`
 *     tags:
 *       - Delivery Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         example: 1
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 20
 *         example: 20
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
 *                     $ref: '#/components/schemas/DeliveryAssignment'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                       example: 200
 *                     currentPage:
 *                       type: integer
 *                       example: 1
 *                     totalPages:
 *                       type: integer
 *                       example: 10
 *       401:
 *         description: Unauthorized (missing/invalid token)
 *       403:
 *         description: Forbidden (requires Admin role)
 *       500:
 *         description: Internal server error
 */
deliveryAdminRouter.get(
    "/assignments",
    isAdmin,
    checkPermission(ModuleName.DELIVERY, PermissionLevel.VIEW),
    asyncHandler(deliveryAdminController.getAllAssignments.bind(deliveryAdminController)),
);

/**
 * @swagger
 * /api/admin/delivery/orders/{orderId}/assignment:
 *   get:
 *     summary: Get latest assignment for an order
 *     description: |
 *       Returns the latest delivery assignment for the order (includes rider + order relations).
 *
 *       Legacy alias: `/api/delivery/admin/orders/{orderId}/assignment`
 *     tags:
 *       - Delivery Admin
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
 *         description: Assignment fetched successfully
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
 *                       example: 9001
 *                     orderId:
 *                       type: integer
 *                       example: 101
 *                     riderId:
 *                       type: integer
 *                       example: 12
 *                     assignmentStatus:
 *                       type: string
 *                       example: "assigned"
 *       401:
 *         description: Unauthorized (missing/invalid token)
 *       403:
 *         description: Forbidden (requires Admin or Staff)
 *       404:
 *         description: Assignment not found
 *       500:
 *         description: Internal server error
 */
deliveryAdminRouter.get(
    "/orders/:orderId/assignment",
    checkPermission(ModuleName.DELIVERY, PermissionLevel.VIEW),
    asyncHandler(
        deliveryAdminController.findOrderAssignment.bind(deliveryAdminController),
    ),
);

/**
 * @swagger
 * /api/admin/delivery/orders/{orderId}/reset-to-warehouse:
 *   patch:
 *     summary: Reset order back to warehouse
 *     description: |
 *       Transitions the order deliveryStatus to `AT_WAREHOUSE` (if allowed) and marks
 *       the order status as `RETURNED`.
 *
 *       Legacy alias: `/api/delivery/admin/orders/{orderId}/reset-to-warehouse`
 *     tags:
 *       - Delivery Admin
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
 *         description: Order reset successfully
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
 *                       example: 101
 *                     deliveryStatus:
 *                       type: string
 *                       example: "AT_WAREHOUSE"
 *                     message:
 *                       type: string
 *                       example: "Order reset to warehouse"
 *       400:
 *         description: Invalid delivery status transition
 *       401:
 *         description: Unauthorized (missing/invalid token)
 *       403:
 *         description: Forbidden (requires Admin or Staff)
 *       404:
 *         description: Order not found
 *       500:
 *         description: Internal server error
 */
deliveryAdminRouter.patch(
    "/orders/:orderId/reset-to-warehouse",
    checkPermission(ModuleName.DELIVERY, PermissionLevel.CREATE_EDIT),
    asyncHandler(
        deliveryAdminController.resetToWarehouse.bind(deliveryAdminController),
    ),
);

deliveryAdminRouter.get(
    "/orders/failed-deliveries",
    checkPermission(ModuleName.DELIVERY, PermissionLevel.VIEW),
    asyncHandler(
        deliveryAdminController.getFailedDeliveries.bind(deliveryAdminController),
    ),
);

export default deliveryAdminRouter;
