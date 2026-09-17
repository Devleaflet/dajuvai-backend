import { Router } from "express";
import type { RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import { singleUploadMiddleware } from "../config/multer.config";
import { ImageController } from "../controllers/image.controller";
import { combinedAuthMiddleware } from "../middlewares/auth.middleware";

const imageRouter = Router();
const imageController = new ImageController();

/**
 * Uploads require an authenticated user or vendor (spec OPT-7 / BUG-5).
 * Sole exception: `folder=vendor` — vendor signup uploads registration
 * documents before any account/token exists, so that folder stays public
 * while every other folder rejects unauthenticated callers.
 */
const uploadAuthMiddleware: RequestHandler = (req, res, next) => {
    void combinedAuthMiddleware(req as any, res, (err?: unknown) => {
        if (!err) return next();
        if (String(req.query.folder ?? "") === "vendor") return next();
        next(err);
    });
};

/**
 * Anonymous uploads only. A registration supplies at most ten documents
 * (five tax, five citizenship), so twenty per window leaves room for one
 * full retry without permitting bulk abuse. An authenticated upload is
 * attributable to an account and is not throttled alongside it.
 */
export const anonymousUploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: "Too many uploads from this address, please try again later.",
    skip: (req) => Boolean((req as any).user || (req as any).vendor),
});

/**
 * @swagger
 * /api/image:
 *   post:
 *     summary: Upload a single file to Cloudinary
 *     description: Uploads one image or supported document to Cloudinary and returns its secure URL, publicId, and resource type. The folder is required and validated before upload.
 *     tags:
 *       - Image
 *     parameters:
 *       - in: query
 *         name: folder
 *         schema:
 *           type: string
 *           example: banners
 *         required: true
 *         description: The folder in Cloudinary where the image will be stored.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: The image or supported document to upload
 *     responses:
 *       200:
 *         description: Image uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: string
 *                   description: Cloudinary secure URL of the uploaded image
 *                   example: "https://res.cloudinary.com/demo/image/upload/v1698854012/products/abcd1234.jpg"
 *       400:
 *         description: No file found or invalid input
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
 *                   example: No file uploaded
 *       502:
 *         description: Cloudinary upload failed
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
 *                   example: UPLOAD_STORAGE_ERROR
 *                 message:
 *                   type: string
 *                   example: File storage upload failed
 *       429:
 *         description: Too many requests, please try again later
 *       503:
 *         description: Cloudinary is not configured
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
 *                   example: UPLOAD_SERVICE_UNAVAILABLE
 *                 message:
 *                   type: string
 *                   example: File upload service is not configured
 */
imageRouter.post(
  "/",
  uploadAuthMiddleware,
  anonymousUploadLimiter,
  singleUploadMiddleware,
  imageController.uploadSingle.bind(imageController),
);

export default imageRouter;
