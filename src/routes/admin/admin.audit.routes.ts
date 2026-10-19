import { Router } from "express";
import { AdminAuditController } from "../../controllers/admin.audit.controller";
import { authMiddleware, isAdminOrStaff, validateZod } from "../../middlewares/auth.middleware";
import { checkPermission } from "../../middlewares/permission.middleware";
import { ModuleName, PermissionLevel } from "../../entities/permission.enum";
import { auditLogQuerySchema } from "../../utils/zod_validations/audit.zod";

const adminAuditRouter = Router();
const controller = new AdminAuditController();

/**
 * @swagger
 * /api/admin/audit-logs:
 *   get:
 *     summary: List application audit logs
 *     description: Admin/staff audit feed. Requires the Audit view permission. Sensitive values are redacted before storage.
 *     tags: [Admin Audit Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 10, maximum: 100, default: 25 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Searches summary, action, module, entity type, entity ID, actor name, email, or phone.
 *       - in: query
 *         name: module
 *         schema: { type: string, example: ORDER }
 *       - in: query
 *         name: actorType
 *         schema: { type: string, enum: [ADMIN, STAFF, VENDOR, USER, RIDER, SYSTEM] }
 *       - in: query
 *         name: entityType
 *         schema: { type: string, example: Product }
 *       - in: query
 *         name: from
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: to
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Paginated audit logs.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 total: { type: integer, example: 246 }
 *                 page: { type: integer, example: 1 }
 *                 limit: { type: integer, example: 25 }
 *                 totalPages: { type: integer, example: 10 }
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, format: uuid }
 *                       module: { type: string, example: ORDER }
 *                       action: { type: string, example: STATUS_CHANGED }
 *                       entityType: { type: string, example: Order }
 *                       entityId: { type: string, example: "123" }
 *                       actorType: { type: string, example: ADMIN }
 *                       actorId: { type: integer, nullable: true }
 *                       actor:
 *                         type: object
 *                         description: Current public actor profile resolved from actorId; names and emails are not copied into audit rows.
 *                         properties:
 *                           id: { type: integer, nullable: true }
 *                           type: { type: string, enum: [ADMIN, STAFF, VENDOR, USER, RIDER, SYSTEM] }
 *                           name: { type: string, nullable: true, example: "Sita Sharma" }
 *                           email: { type: string, format: email, nullable: true, example: "sita@example.com" }
 *                           phoneNumber: { type: string, nullable: true, example: "9812345678" }
 *                           displayName: { type: string, example: "Sita Sharma (ADMIN)" }
 *                       summary: { type: string }
 *                       before: { type: object, nullable: true }
 *                       after: { type: object, nullable: true }
 *                       createdAt: { type: string, format: date-time }
 *       401:
 *         description: Authentication required.
 *       403:
 *         description: Admin role or staff member with Audit view permission required.
 */
adminAuditRouter.get("/", authMiddleware, isAdminOrStaff, checkPermission(ModuleName.AUDIT, PermissionLevel.VIEW), validateZod(auditLogQuerySchema, "query"), controller.list.bind(controller));

export default adminAuditRouter;
