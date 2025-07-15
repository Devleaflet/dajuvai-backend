import { Router } from "express";
import { BannerController } from "../controllers/banner.controller";
import {
	authMiddleware,
	isAdmin,
	isAdminOrStaff,
	validateZod,
} from "../middlewares/auth.middleware";
import {
	createBannerSchema,
	updateBannerSchema,
} from "../utils/zod_validations/banner.zod";
import multer from "multer";

const router = Router();
const bannerController = new BannerController();
const upload = multer({ storage: multer.memoryStorage() });

/**
 * @swagger
 * /api/banners:
 *   post:
 *     summary: Create a new banner
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Summer Sale Banner"
 *               type:
 *                 type: string
 *                 enum: [HERO, SIDEBAR, PRODUCT, SPECIAL_DEALS]
 *                 example: HERO
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, EXPIRED, SCHEDULED]
 *                 example: SCHEDULED
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-06-01T00:00:00Z"
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-06-30T23:59:59Z"
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Banner created successfully
 *       400:
 *         description: Bad request (validation errors)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
	"/",
	authMiddleware,
	isAdminOrStaff,
	upload.single("image"),
	validateZod(createBannerSchema),
	bannerController.createBanner.bind(bannerController)
);

/**
 * @swagger
 * /api/banners/{id}:
 *   patch:
 *     summary: Update an existing banner
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Banner ID
 *     requestBody:
 *       required: false
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [HERO, SIDEBAR, PRODUCT, SPECIAL_DEALS]
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, EXPIRED, SCHEDULED]
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               image:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Banner updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Banner not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.patch(
	"/:id",
	authMiddleware,
	isAdminOrStaff,
	upload.single("image"),
	validateZod(updateBannerSchema),
	bannerController.updateBanner.bind(bannerController)
);

/**
 * @swagger
 * /api/banners/{id}:
 *   get:
 *     summary: Get a banner by ID
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Banner ID
 *     responses:
 *       200:
 *         description: Banner details
 *       404:
 *         description: Banner not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:id", bannerController.getBannerById.bind(bannerController));

/**
 * @swagger
 * /api/banners:
 *   get:
 *     summary: Get all banners
 *     tags: [Banners]
 *     responses:
 *       200:
 *         description: List of banners
 *       500:
 *         description: Internal server error
 */
router.get("/", bannerController.getAllBanners.bind(bannerController));

/**
 * @swagger
 * /api/banners/{id}:
 *   delete:
 *     summary: Delete a banner
 *     description: Delete a banner by its ID. Only accessible by admin users.
 *     tags: [Banners]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the banner to delete
 *     responses:
 *       200:
 *         description: Banner deleted successfully
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
 *                   example: "Banner with id: 3 delete successfully"
 *       401:
 *         description: Unauthorized - admin access required
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
 *                   example: "Unauthorized"
 *       404:
 *         description: Banner not found
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
 *                   example: "Banner with id: 3 does not exist"
 *       500:
 *         description: Internal server error
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
 *                   example: "Internal server error"
 */
router.delete(
	"/:id",
	authMiddleware,
	isAdminOrStaff,
	bannerController.deleteBanner.bind(bannerController)
);

/**
 * @swagger
 * /api/banners/search/{bannerName}:
 *   get:
 *     summary: Search banners by banner name
 *     tags:
 *       - Banners
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: bannerName
 *         required: true
 *         schema:
 *           type: string
 *         description: The banner name or partial name to search for
 *     responses:
 *       200:
 *         description: Successfully retrieved matching banners
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
 *                       name:
 *                         type: string
 *                         example: "Summer Sale"
 *                       image:
 *                         type: string
 *                         example: "https://example.com/banner.jpg"
 *                       type:
 *                         type: string
 *                         example: "Hero"
 *                       status:
 *                         type: string
 *                         example: "ACTIVE"
 *                       startDate:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-06-01T00:00:00.000Z"
 *                       endDate:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-06-30T23:59:59.000Z"
 *                       createdBy:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 10
 *                           name:
 *                             type: string
 *                             example: "Admin User"
 *       404:
 *         description: Banner name is missing or no banner found
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
 *                   example: "Banner does not exist"
 *       500:
 *         description: Internal server error
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
 *                   example: "Internal server error"
 */
router.get(
	"/search/:bannerName",
	authMiddleware,
	isAdminOrStaff,
	bannerController.searchBannerByBannerName.bind(bannerController)
);


export default router;
