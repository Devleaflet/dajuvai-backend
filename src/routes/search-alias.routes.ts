import { Router } from "express";
import { SearchAliasController } from "../controllers/search-alias.controller";
import { authMiddleware, isAdmin } from "../middlewares/auth.middleware";
import { asyncHandler } from "../utils/asyncHandler.utils";

const router = Router();
const controller = new SearchAliasController();

/**
 * @swagger
 * /api/admin/search-aliases:
 *   get:
 *     summary: List search aliases or learning candidates
 *     tags: [Search Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: state
 *         schema: { type: string, enum: [candidate, active], default: candidate }
 *         description: Candidate list returns inactive learning candidates; active returns enabled aliases.
 *     responses:
 *       200:
 *         description: Alias records.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { type: array, items: { $ref: '#/components/schemas/SearchAliasRecord' } }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       500: { $ref: '#/components/responses/InternalServerError' }
 */
router.get("/", authMiddleware, isAdmin, asyncHandler(controller.list.bind(controller)));

/**
 * @swagger
 * /api/admin/search-aliases/{id}/approve:
 *   post:
 *     summary: Approve a search alias
 *     tags: [Search Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Alias approved.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success]
 *               properties: { success: { type: boolean, example: true } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       500: { $ref: '#/components/responses/InternalServerError' }
 */
router.post("/:id/approve", authMiddleware, isAdmin, asyncHandler(controller.approve.bind(controller)));

/**
 * @swagger
 * /api/admin/search-aliases/{id}/disable:
 *   post:
 *     summary: Disable a search alias
 *     tags: [Search Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer, minimum: 1 }
 *     responses:
 *       200:
 *         description: Alias disabled.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success]
 *               properties: { success: { type: boolean, example: true } }
 *       400: { $ref: '#/components/responses/BadRequest' }
 *       401: { $ref: '#/components/responses/Unauthorized' }
 *       403: { $ref: '#/components/responses/Forbidden' }
 *       500: { $ref: '#/components/responses/InternalServerError' }
 */
router.post("/:id/disable", authMiddleware, isAdmin, asyncHandler(controller.disable.bind(controller)));

export default router;
