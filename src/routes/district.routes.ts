import { Router } from "express";
import { DistrictController } from "../controllers/district.controller";
import { createDistrictSchema, updateDistrictSchema, getDistrictByIdSchema } from "../utils/zod_validations/district.zod"
import { authMiddleware, isAdmin, isAdminOrStaff, validateZod } from "../middlewares/auth.middleware";

const router = Router();
const districtController = new DistrictController();

/**
 * @swagger
 * tags:
 *   - name: Districts
 *     description: API endpoints for managing districts
 */


/**
 * @swagger
 * /api/district:
 *   post:
 *     summary: Create a new district
 *     tags: [Districts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       description: District data to create
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Unique district name
 *                 example: Central District
 *     responses:
 *       201:
 *         description: District created successfully
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
 *                     name:
 *                       type: string
 *                       example: Central District
 *       400:
 *         description: Bad request - validation errors or missing required fields
 *       401:
 *         description: Unauthorized - missing or invalid authentication token
 *       409:
 *         description: Conflict - district with this name already exists
 *       500:
 *         description: Internal server error
 */
router.post(
    "/",
    authMiddleware,
    isAdminOrStaff,
    validateZod(createDistrictSchema),
    districtController.createDistrict.bind(districtController)
);


/**
 * @swagger
 * /api/district/{id}:
 *   put:
 *     summary: Update a district's name by ID
 *     tags: [Districts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: District ID
 *         example: 1
 *     requestBody:
 *       description: New district name
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 100
 *                 description: Updated district name (unique)
 *                 example: Updated Central District
 *     responses:
 *       200:
 *         description: District updated successfully
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
 *                     name:
 *                       type: string
 *                       example: Updated Central District
 *       400:
 *         description: Bad request - validation errors or missing name
 *       401:
 *         description: Unauthorized - missing or invalid authentication token
 *       404:
 *         description: District not found
 *       409:
 *         description: Conflict - district name already exists
 *       500:
 *         description: Internal server error
 */
router.put(
    "/:id",
    authMiddleware,
    isAdminOrStaff,
    validateZod(updateDistrictSchema),
    districtController.updateDistrict.bind(districtController)
);


/**
 * @swagger
 * /api/district:
 *   get:
 *     summary: Retrieve a list of all districts
 *     tags: [Districts]
 *     responses:
 *       200:
 *         description: List of districts retrieved successfully
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
 *                   description: Array of district objects
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         example: 1
 *                       name:
 *                         type: string
 *                         example: Central District
 *       500:
 *         description: Internal server error
 */
router.get(
    "/",
    districtController.getDistricts.bind(districtController)
);


/**
 * @swagger
 * /api/district/{id}:
 *   get:
 *     summary: Get a district by its ID
 *     tags: [Districts]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: District ID
 *         example: 1
 *     responses:
 *       200:
 *         description: District retrieved successfully
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
 *                     name:
 *                       type: string
 *                       example: Central District
 *       400:
 *         description: Bad request - invalid district ID
 *       404:
 *         description: District not found
 *       500:
 *         description: Internal server error
 */
router.get(
    "/:id",
    districtController.getDistrictById.bind(districtController)
);

/**
 * @swagger
 * /api/district/{id}:
 *   delete:
 *     summary: Delete a district by ID
 *     tags: [Districts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: District ID
 *         example: 1
 *     responses:
 *       200:
 *         description: District deleted successfully
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
 *                   example: District deleted successfully
 *       400:
 *         description: Bad request - invalid district ID
 *       401:
 *         description: Unauthorized - missing or invalid authentication token
 *       404:
 *         description: District not found
 *       500:
 *         description: Internal server error
 */
router.delete(
    "/:id",
    authMiddleware,
    isAdminOrStaff,
    districtController.deleteDistrict.bind(districtController)
);

export default router;