import { Router } from "express";
import { BannerController } from "../controllers/banner.controller";
import {
	authMiddleware,
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
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - type
 *               - productSource
 *               - startDate
 *               - endDate
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *                 example: "Summer Sale Banner"
 *               type:
 *                 type: string
 *                 enum: [HERO, SIDEBAR, PRODUCT, SPECIAL_DEALS]
 *                 example: HERO
 *               productSource:
 *                 type: string
 *                 enum: [manual, category, subcategory, deal, external]
 *                 example: manual
 *               selectedProducts:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Required if productSource is manual
 *               selectedCategoryId:
 *                 type: integer
 *                 description: Required if productSource is category or subcategory
 *               selectedSubcategoryId:
 *                 type: integer
 *                 description: Required if productSource is subcategory
 *               placementAfterSection:
 *                 type: integer
 *                 description: Homepage position for SIDEBAR banners (positive integer)
 *               selectedDealId:
 *                 type: integer
 *                 description: Required if productSource is deal
 *               externalLink:
 *                 type: string
 *                 format: uri
 *                 description: Required if productSource is external
 *               startDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-06-01T00:00:00Z"
 *               endDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2025-06-30T23:59:59Z"
 *               desktopImage:
 *                 type: string
 *                 description: URL for desktop view image (optional)
 *               mobileImage:
 *                 type: string
 *                 description: URL for mobile view image (optional)
 *     responses:
 *       201:
 *         description: Banner created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Banner' }
 *       400:
 *         description: Bad request (validation errors)
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
 *                   example: "Error message describing what went wrong"
 *       401:
 *         description: Unauthorized
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
 *                   example: "Error message describing what went wrong"
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
 *                   example: "Error message describing what went wrong"
 */
router.post(
	"/",
	authMiddleware,
	isAdminOrStaff,
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 100
 *               type:
 *                 type: string
 *                 enum: [HERO, SIDEBAR, PRODUCT, SPECIAL_DEALS]
 *               productSource:
 *                 type: string
 *                 enum: [manual, category, subcategory, deal, external]
 *               selectedProducts:
 *                 type: array
 *                 items:
 *                   type: integer
 *               selectedCategoryId:
 *                 type: integer
 *               selectedSubcategoryId:
 *                 type: integer
 *               placementAfterSection:
 *                 type: integer
 *               selectedDealId:
 *                 type: integer
 *               externalLink:
 *                 type: string
 *                 format: uri
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               endDate:
 *                 type: string
 *                 format: date-time
 *               desktopImage:
 *                 type: string
 *                 description: URL for desktop view image (optional)
 *               mobileImage:
 *                 type: string
 *                 description: URL for mobile view image (optional)
 *     responses:
 *       200:
 *         description: Banner updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Banner' }
 *       400:
 *         description: Bad request
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
 *                   example: "Error message describing what went wrong"
 *       404:
 *         description: Banner not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiError'
 *       401:
 *         description: Unauthorized
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
 *                   example: "Error message describing what went wrong"
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
 *                   example: "Error message describing what went wrong"
 */
router.patch(
	"/:id",
	authMiddleware,
	isAdminOrStaff,
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data: { $ref: '#/components/schemas/Banner' }
 *       401:
 *         description: Unauthorized
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
 *                   example: "Error message describing what went wrong"
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
 *                   example: "Error message describing what went wrong"
 */
router.get("/:id", bannerController.getBannerById.bind(bannerController));

/**
 * @swagger
 * /api/banners:
 *   get:
 *     summary: Get all banners
 *     tags: [Banners]
 *     parameters:
 *       - in: query
 *         name: type
 *         required: false
 *         description: Filter banners by banner type.
 *         schema:
 *           type: string
 *           enum: [HERO, SIDEBAR, PRODUCT, SPECIAL_DEALS]
 *         example: HERO
 *     responses:
 *       200:
 *         description: List of banners
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, data]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Banner' }
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
 *                   example: "Error message describing what went wrong"
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
 *                 data: { $ref: '#/components/schemas/Banner' }
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
