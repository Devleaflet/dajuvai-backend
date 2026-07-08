import { Router } from "express";
import { CommissionController } from "../controllers/commission.controller";
import {
    authMiddleware,
    combinedAuthMiddleware,
    isAdminOrStaff,
    requireAdminStaffOrVendor,
} from "../middlewares/auth.middleware";
import { uploadMiddleware } from "../config/multer.config";

const router = Router();
const commissionController = new CommissionController();

/**
 * @swagger
 * /api/commission:
 *   post:
 *     summary: Upload/replace the commission document
 *     description: Admin or staff uploads a new commission PDF directly (stored on the server, not Cloudinary). Vendors are notified in real-time over Socket.io (event "commission:update").
 *     tags: [Commission]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [title, file]
 *             properties:
 *               title:
 *                 type: string
 *                 example: "Commission Structure 2026"
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: PDF file only
 *     responses:
 *       201:
 *         description: Commission document updated successfully
 *       400:
 *         description: Validation error (missing title/file, or non-PDF file)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin or staff access required
 */
router.post(
    "/",
    authMiddleware,
    isAdminOrStaff,
    uploadMiddleware,
    commissionController.uploadDocument.bind(commissionController),
);

/**
 * @swagger
 * /api/commission:
 *   get:
 *     summary: Get the current commission document
 *     description: Returns the commission document currently visible on vendor dashboards. Accessible by admin, staff, or any vendor.
 *     tags: [Commission]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current commission document
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No commission document has been uploaded yet
 */
router.get(
    "/",
    combinedAuthMiddleware,
    requireAdminStaffOrVendor,
    commissionController.getDocument.bind(commissionController),
);

/**
 * @swagger
 * /api/commission/file:
 *   get:
 *     summary: Stream the current commission document's file
 *     description: Proxies the file through the backend so Content-Type and Content-Disposition are set deterministically (Cloudinary's raw-resource delivery defaults are unreliable for inline preview/download filename). Pass ?download=1 to force a download instead of inline viewing.
 *     tags: [Commission]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: download
 *         schema:
 *           type: string
 *           enum: ["1"]
 *         required: false
 *     responses:
 *       200:
 *         description: File stream
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No commission document has been uploaded yet
 */
router.get(
    "/file",
    combinedAuthMiddleware,
    requireAdminStaffOrVendor,
    commissionController.getFile.bind(commissionController),
);

/**
 * @swagger
 * /api/commission:
 *   delete:
 *     summary: Delete the current commission document
 *     description: Removes the active commission document from vendor view (kept as history, same as replacing it). Vendors are notified in real-time over Socket.io (event "commission:delete").
 *     tags: [Commission]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Commission document deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Admin or staff access required
 *       404:
 *         description: No commission document has been uploaded yet
 */
router.delete(
    "/",
    authMiddleware,
    isAdminOrStaff,
    commissionController.deleteDocument.bind(commissionController),
);

export default router;
