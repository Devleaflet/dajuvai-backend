
import { Router } from "express";
import { authMiddleware, isAdminOrStaff, validateZod } from "../middlewares/auth.middleware";
import { PromoController } from "../controllers/promo.controller";
import { createPromoSchema, deletePromoSchema, editPromoSchema } from "../utils/zod_validations/promo.zod";

const promoRouter = Router();

const promoController = new PromoController();

/**
 * @swagger
 * /api/promo:
 *   get:
 *     summary: Get all promo codes
 *     description: |
 *       Retrieve all promo codes in the system.  
 *       Requires Bearer authentication.  
 *       User must have admin or staff privileges.
 *     tags:
 *       - Promo Code
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved promo codes.
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
 *                       promoCode:
 *                         type: string
 *                         example: SUMMER2025
 *                       discountPercentage:
 *                         type: integer
 *                         example: 15
 *       401:
 *         description: Unauthorized - Missing or invalid token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 msg:
 *                   type: string
 *                   example: Unauthorized
 *       403:
 *         description: Forbidden - User does not have admin or staff access.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 msg:
 *                   type: string
 *                   example: Forbidden
 *       500:
 *         description: Internal server error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 msg:
 *                   type: string
 *                   example: Internal server error
 */
promoRouter.get("/", promoController.getPromoCode.bind(promoController));


/**
 * @swagger
 * /api/promo:
 *   post:
 *     summary: Create a new promo code
 *     description: |
 *       Create a new promo code with a unique code and discount percentage.
 *       Requires Bearer authentication.
 *       User must have admin or staff privileges.
 *     tags:
 *       - Promo
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - promoCode
 *               - discountPercentage
 *             properties:
 *               promoCode:
 *                 type: string
 *                 example: SUMMER2025
 *               discountPercentage:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *                 example: 15
 *     responses:
 *       201:
 *         description: Promo code created successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 msg:
 *                   type: string
 *                   example: New promo code created
 *       400:
 *         description: Bad request - Validation failed.
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
 *                   example: Promo code is required
 *       401:
 *         description: Unauthorized - Missing or invalid token.
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
 *                   example: Unauthorized
 *       403:
 *         description: Forbidden - User does not have admin or staff access.
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
 *                   example: Forbidden
 *       500:
 *         description: Internal server error.
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
 *                   example: Internal Server Error
 */
promoRouter.post("/", authMiddleware, isAdminOrStaff, validateZod(createPromoSchema, "body"), promoController.createPromo.bind(promoController));

/**
 * @swagger
 * /api/promo/{id}:
 *   delete:
 *     summary: Delete a promo code
 *     description: |
 *       Deletes a promo code by its ID.  
 *       Requires Bearer authentication.  
 *       User must have admin or staff privileges.
 *     tags:
 *       - Promo
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID of the promo code to delete
 *         schema:
 *           type: integer
 *           example: 1
 *     responses:
 *       200:
 *         description: Promo code deleted successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 msg:
 *                   type: string
 *                   example: Promo code deleted successfully
 *       400:
 *         description: Bad request - ID is missing or invalid.
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
 *                   example: Promo id is required
 *       401:
 *         description: Unauthorized - Missing or invalid token.
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
 *                   example: Unauthorized
 *       403:
 *         description: Forbidden - User does not have admin or staff access.
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
 *                   example: Forbidden
 *       404:
 *         description: Promo code not found.
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
 *                   example: Promo code not found
 *       500:
 *         description: Internal server error.
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
 *                   example: Internal Server Error
 */
promoRouter.delete("/:id", authMiddleware, isAdminOrStaff, validateZod(deletePromoSchema, "params"), promoController.deletePromo.bind(promoController));


/**
 * @swagger
 * /api/promo/{id}:
 *   patch:
 *     summary: Update a promo code
 *     description: Allows admin or staff to update an existing promo code.
 *     tags:
 *       - Promo
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Promo ID
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               promoCode:
 *                 type: string
 *                 example: "NEWYEAR25"
 *               discountPercentage:
 *                 type: number
 *                 minimum: 1
 *                 maximum: 100
 *                 example: 25
 *               applyOn:
 *                 type: string
 *                 enum: [LINE_TOTAL, SHIPPING]
 *                 example: LINE_TOTAL
 *               isValid:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Promo code updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sucess:
 *                   type: boolean
 *                   example: true
 *                 msg:
 *                   type: string
 *                   example: Promo code update succesfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     promoCode:
 *                       type: string
 *                       example: "NEWYEAR25"
 *                     discountPercentage:
 *                       type: number
 *                       example: 25
 *                     applyOn:
 *                       type: string
 *                       example: LINE_TOTAL
 *                     isValid:
 *                       type: boolean
 *                       example: true
 *       400:
 *         description: Bad request (invalid input)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not admin or staff)
 *       404:
 *         description: Promo code not found
 */
promoRouter.patch("/:id", authMiddleware, isAdminOrStaff, validateZod(editPromoSchema, "body"), promoController.updatePromo.bind(promoController));

export default promoRouter;