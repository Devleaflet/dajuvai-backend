import { Router } from "express";
import { uploadMiddleware } from "../config/multer.config";
import { ImageService } from "../service/image.service";
import { ImageController } from "../controllers/image.controller";

const imageRouter = Router();
const imageController = new ImageController()

/**
 * @swagger
 * /api/image:
 *   post:
 *     summary: Upload a single image to Cloudinary
 *     description: Uploads a single image file to Cloudinary and returns its secure URL and publicId. The target folder can be specified in query params.
 *     tags:
 *       - Image
 *     parameters:
 *       - in: query
 *         name: folder
 *         schema:
 *           type: string
 *           example: products
 *         required: true
 *         description: The folder in Cloudinary where the image will be stored.
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The image file to upload
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
 *                 msg:
 *                   type: string
 *                   example: No file found
 *       500:
 *         description: Image upload failed on server or Cloudinary side
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
 *                   example: Error uploading image
 */
imageRouter.post("/", uploadMiddleware, imageController.uplaodSingle.bind(imageController))

export default imageRouter;