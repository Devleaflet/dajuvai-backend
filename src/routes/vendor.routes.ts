import { Router } from "express";
import { VendorController } from "../controllers/vendor.controller";
import {
    authMiddleware,
    combinedAuthMiddleware,
    isAdmin,
    isAdminOrStaff,
    isVendor,
    restrictToVendorOrAdmin,
    vendorAuthMiddleware,
} from "../middlewares/auth.middleware";
import { checkPermission } from "../middlewares/permission.middleware";
import { ModuleName, PermissionLevel } from "../entities/permission.enum";
import {
    vendorSignupSchema,
    vendorLoginSchema,
    updateVendorSchema,
    resetPasswordSchema,
    vendorSignupSchemav2,
    updateVendorSchema2,
    updateVendorPaymentOptionSchema,
} from "../utils/zod_validations/vendor.zod";

import { validateZod } from "../middlewares/auth.middleware";
import { ProductController } from "../controllers/product.controller";
import AppDataSource from "../config/db.config";
import { verificationTokenSchema } from "../utils/zod_validations/user.zod";
import { authRateLimiter } from "./user.routes";
import { VendorProductsQuerySchema } from "../utils/zod_validations/product.zod";

const router = Router();
const vendorController = new VendorController();
const productController = new ProductController(AppDataSource);

/**
 * @swagger
 * /api/vendors:
 *   get:
 *     summary: Get all vendors
 *     description: Retrieves a list of all registered vendors (Admin access required)
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved all vendors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates if the request was successful
 *                   example: true
 *                 data:
 *                   type: array
 *                   description: Array of vendor objects
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         description: Unique vendor identifier
 *                         example: 1
 *                       businessName:
 *                         type: string
 *                         description: Name of the vendor's business
 *                         example: "ABC Electronics Store"
 *                       email:
 *                         type: string
 *                         format: email
 *                         description: Vendor's email address
 *                         example: "vendor@abcelectronics.com"
 *                       businessAddress:
 *                         type: string
 *                         description: Physical address of the business
 *                         example: "123 Main Street, City, State 12345"
 *                       phoneNumber:
 *                         type: string
 *                         description: Business contact phone number
 *                         example: "+1234567890"
 *                       isVerified:
 *                         type: boolean
 *                         description: Email verification status
 *                         example: true
 *             example:
 *               success: true
 *               data: [
 *                 {
 *                   "id": 1,
 *                   "businessName": "ABC Electronics Store",
 *                   "email": "vendor@abcelectronics.com",
 *                   "businessAddress": "123 Main Street, City, State 12345",
 *                   "phoneNumber": "+1234567890",
 *                   "isVerified": true
 *                 }
 *               ]
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates request failure
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message describing authentication failure
 *                   example: "Access denied. No token provided."
 *             example:
 *               success: false
 *               message: "Access denied. No token provided."
 *       403:
 *         description: Forbidden - Admin access required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates request failure
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message describing authorization failure
 *                   example: "Access denied. Admin privileges required."
 *             example:
 *               success: false
 *               message: "Access denied. Admin privileges required."
 *       503:
 *         description: Service temporarily unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates request failure
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message describing service unavailability
 *                   example: "Service temporarily unavailable"
 *             example:
 *               success: false
 *               message: "Service temporarily unavailable"
 */

router.get(
    "/",
    authMiddleware,
    isAdminOrStaff,
    checkPermission(ModuleName.VENDOR, PermissionLevel.VIEW),
    vendorController.getVendors.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/partial/vendors:
 *   get:
 *     summary: Get partial vendor list (public)
 *     description: Retrieves a lightweight list of approved vendors (id, businessName, logo). Used for vendor selection dropdowns and public displays.
 *     tags: [Vendors]
 *     responses:
 *       200:
 *         description: Successfully retrieved partial vendor list
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
 *                       businessName:
 *                         type: string
 *                         example: "ABC Electronics Store"
 *                       logo:
 *                         type: string
 *                         nullable: true
 *                         example: "https://res.cloudinary.com/.../logo.jpg"
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
    "/partial/vendors",
    vendorController.getPartialVendors.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/unapprove/list:
 *   get:
 *     summary: Get all unapproved vendors
 *     description: Retrieves a list of all vendors whose accounts are not approved yet (Admin access required)
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved unapproved vendors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates if the request was successful
 *                   example: true
 *                 data:
 *                   type: array
 *                   description: Array of unapproved vendor objects
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                         description: Unique vendor identifier
 *                         example: 1
 *                       businessName:
 *                         type: string
 *                         description: Name of the vendor's business
 *                         example: "GS Supports"
 *                       email:
 *                         type: string
 *                         format: email
 *                         description: Vendor's email address
 *                         example: "gssupport@gmail.com"
 *                       phoneNumber:
 *                         type: string
 *                         description: Business contact phone number
 *                         example: "9811263522"
 *                       districtId:
 *                         type: integer
 *                         description: Associated district ID
 *                         example: 2
 *                       isVerified:
 *                         type: boolean
 *                         description: Email verification status
 *                         example: true
 *                       isApproved:
 *                         type: boolean
 *                         description: Approval status of the vendor
 *                         example: false
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         description: Vendor creation timestamp
 *                         example: "2025-08-04T21:03:26.319Z"
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         description: Vendor last update timestamp
 *                         example: "2025-08-04T21:03:26.319Z"
 *                       district:
 *                         type: object
 *                         description: District details
 *                         properties:
 *                           id:
 *                             type: integer
 *                             example: 2
 *                           name:
 *                             type: string
 *                             example: "Pokhara"
 *             example:
 *               success: true
 *               data: [
 *                 {
 *                   "id": 1,
 *                   "businessName": "GS Supports",
 *                   "email": "gssupport@gmail.com",
 *                   "phoneNumber": "9811263522",
 *                   "districtId": 2,
 *                   "isVerified": true,
 *                   "isApproved": false,
 *                   "createdAt": "2025-08-04T21:03:26.319Z",
 *                   "updatedAt": "2025-08-04T21:03:26.319Z",
 *                   "district": {
 *                     "id": 2,
 *                     "name": "Pokhara"
 *                   }
 *                 }
 *               ]
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
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
 *                   example: "Access denied. No token provided."
 *       403:
 *         description: Forbidden - Admin access required
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
 *                   example: "Access denied. Admin privileges required."
 *       503:
 *         description: Service temporarily unavailable
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
 *                   example: "Service temporarily unavailable"
 */
router.get(
    "/unapprove/list",
    authMiddleware,
    isAdminOrStaff,
    checkPermission(ModuleName.VENDOR, PermissionLevel.VIEW),
    vendorController.getUnapprovedVendorList.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/{vendorId}/products:
 *   get:
 *     summary: Get products by vendor ID
 *     description: Retrieves paginated products belonging to a specific vendor.
 *     tags: [Vendors]
 *     parameters:
 *       - in: path
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the vendor
 *         example: 12
 *       - in: query
 *         name: page
 *         required: false
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of products per page
 *       - in: query
 *         name: search
 *         required: false
 *         schema:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *         description: Case-insensitive product search text.
 *       - in: query
 *         name: sortBy
 *         required: false
 *         schema:
 *           type: string
 *           enum: [a-z, z-a, price-high-low, price-low-high, stock-high-low, stock-low-high, newest, oldest]
 *         description: Product sort order.
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [AVAILABLE, OUT_OF_STOCK, LOW_STOCK]
 *         description: Inventory status filter.
 *     responses:
 *       200:
 *         description: List of products for the given vendor
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
 *                     products:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Product'
 *                     total:
 *                       type: integer
 *                       example: 23
 *       404:
 *         description: Vendor not found
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
 *                   example: "Vendor not found"
 *       500:
 *         description: Internal Server Error
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
 *                   example: "Internal Server Error"
 */
router.get(
    "/:vendorId/products",
    validateZod(VendorProductsQuerySchema, "query"),
    productController.getProductsByVendorId.bind(productController),
);

/**
 * @swagger
 * /api/vendors/{id}:
 *   get:
 *     summary: Get vendor by ID
 *     description: Retrieves a single vendor's details using the vendor ID. Accessible by authenticated admins.
 *     tags: [Vendors]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID of the vendor to retrieve
 *         schema:
 *           type: integer
 *           example: 5
 *     responses:
 *       200:
 *         description: Vendor details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Vendor'
 *       400:
 *         description: Invalid vendor ID
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
 *                   example: "Invalid vendor ID"
 *       404:
 *         description: Vendor not found
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
 *                   example: "Vendor not found"
 *       503:
 *         description: Vendor service temporarily unavailable
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
 *                   example: "Vendor service temporarily unavailable"
 */
router.get("/:id", vendorController.getVendorById.bind(vendorController));

// /api/vendors/auth/vendor
/**
 * @swagger
 * /api/vendors/auth/vendor:
 *   get:
 *     summary: Get authenticated vendor profile
 *     description: Returns the currently authenticated vendor's profile data. Requires a valid vendor JWT token.
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Vendor profile retrieved successfully
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
 *                     businessName:
 *                       type: string
 *                       example: "ABC Electronics Store"
 *                     email:
 *                       type: string
 *                       format: email
 *                       example: "vendor@abcelectronics.com"
 *                     phoneNumber:
 *                       type: string
 *                       example: "+1234567890"
 *                     district:
 *                       type: string
 *                       example: "Kathmandu"
 *                     isApproved:
 *                       type: boolean
 *                       example: true
 *                     isVerified:
 *                       type: boolean
 *                       example: true
 *       401:
 *         description: Unauthorized - Invalid or missing vendor token
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
 *         description: Vendor not found
 *       500:
 *         description: Internal server error
 */
router.get(
    "/auth/vendor",
    vendorAuthMiddleware,
    isVendor,
    vendorController.authVendor.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/signup:
 *   post:
 *     summary: Register a new vendor
 *     description: Creates a new vendor account, sends a verification email with a token, and sets a JWT cookie for authentication.
 *     tags: [Vendors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - businessName
 *               - email
 *               - password
 *               - phoneNumber
 *               - district
 *               - businessRegNumber
 *               - taxDocuments
 *             properties:
 *               businessName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 description: Name of the vendor's business (required, 3-100 characters).
 *                 example: "ABC Electronics Store"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Valid email address for the vendor account (required, must be unique).
 *                 example: "vendor@abcelectronics.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 maxLength: 25
 *                 description: Secure password for account access (required, 8-25 characters).
 *                 example: "securepassword123"
 *               phoneNumber:
 *                 type: string
 *                 pattern: "^\\d{10}$"
 *                 description: Business contact phone number (required, 10 digits).
 *                 example: "9800000000"
 *               telePhone:
 *                 type: string
 *                 pattern: "^(?:\\d{9}|(?=(?:\\D*\\d){9}\\D*$)\\d+-\\d+)$"
 *                 description: Optional telephone number (9 digits, with or without one hyphen).
 *                 example: "01-1234567"
 *               district:
 *                 type: string
 *                 minLength: 1
 *                 description: District where the vendor's business is located (required).
 *                 example: "Kathmandu"
 *               businessRegNumber:
 *                 type: string
 *                 minLength: 1
 *                 description: Business registration number (required).
 *                 example: "BRN-12345"
 *               taxNumber:
 *                 type: string
 *                 description: Tax registration number (optional).
 *                 example: "PAN-123456"
 *               taxDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: Array of tax document URLs (required, at least 1).
 *                 example: ["https://example.com/tax.pdf"]
 *               citizenshipDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: Array of citizenship document URLs (optional).
 *                 example: ["https://example.com/citizenship.pdf"]
 *               accountName:
 *                 type: string
 *                 description: Bank account name (optional).
 *                 example: "ABC Store"
 *               bankName:
 *                 type: string
 *                 description: Bank name (optional).
 *                 example: "Nepal Bank"
 *               accountNumber:
 *                 type: string
 *                 description: Bank account number (optional).
 *                 example: "1234567890"
 *               bankBranch:
 *                 type: string
 *                 description: Bank branch (optional).
 *                 example: "Kathmandu"
 *               profilePicture:
 *                 type: string
 *                 format: uri
 *                 description: Profile picture URL (optional).
 *                 example: "https://example.com/logo.jpg"
 *           example:
 *             businessName: "ABC Electronics Store"
 *             email: "vendor@abcelectronics.com"
 *             password: "securepassword123"
 *             phoneNumber: "9800000000"
 *             district: "Kathmandu"
 *             businessRegNumber: "BRN-12345"
 *             taxDocuments: ["https://example.com/tax.pdf"]
 *     responses:
 *       201:
 *         description: Vendor registered successfully, verification email sent, and JWT cookie set.
 *         headers:
 *           Set-Cookie:
 *             description: HTTP-only authentication cookie containing the JWT token.
 *             schema:
 *               type: string
 *               example: "vendorToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=Strict; Max-Age=7200"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates successful vendor registration.
 *                   example: true
 *                 vendor:
 *                   type: object
 *                   description: Created vendor information.
 *                   properties:
 *                     id:
 *                       type: integer
 *                       description: Unique vendor identifier.
 *                       example: 1
 *                     businessName:
 *                       type: string
 *                       description: Name of the vendor's business.
 *                       example: "ABC Electronics Store"
 *                     email:
 *                       type: string
 *                       format: email
 *                       description: Vendor's email address.
 *                       example: "vendor@abcelectronics.com"
 *                     phoneNumber:
 *                       type: string
 *                       description: Vendor's phone number.
 *                       example: "+1234567890"
 *                     district:
 *                       type: string
 *                       description: District of the vendor's business.
 *                       example: "Downtown District"
 *                     verificationCode:
 *                       type: string
 *                       description: Hashed verification token for email verification.
 *                       example: "hashedToken123"
 *                     verificationCodeExpire:
 *                       type: string
 *                       format: date-time
 *                       description: Expiry date and time for the verification token (15 minutes from creation).
 *                       example: "2025-06-11T11:17:00.000Z"
 *                 token:
 *                   type: string
 *                   description: JWT authentication token (expires in 2 hours).
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *             example:
 *               success: true
 *               vendor:
 *                 id: 1
 *                 businessName: "ABC Electronics Store"
 *                 email: "vendor@abcelectronics.com"
 *                 phoneNumber: "+1234567890"
 *                 district: "Downtown District"
 *                 verificationCode: "hashedToken123"
 *                 verificationCodeExpire: "2025-06-11T11:17:00.000Z"
 *               token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: Invalid input data, validation errors, or district does not exist.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates request failure.
 *                   example: false
 *                 errors:
 *                   type: array
 *                   description: Array of validation errors (if applicable).
 *                   items:
 *                     type: object
 *                     properties:
 *                       path:
 *                         type: array
 *                         description: Field path that failed validation.
 *                         items:
 *                           type: string
 *                       message:
 *                         type: string
 *                         description: Validation error message.
 *                 message:
 *                   type: string
 *                   description: Error message (if district does not exist).
 *                   example: "District does not exists"
 *             example:
 *               success: false
 *               errors:
 *                 - path: ["businessName"]
 *                   message: "Business name must be at least 3 characters long"
 *       409:
 *         description: Vendor already exists with the provided email.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates request failure.
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message indicating conflict.
 *                   example: "Vendor already exists"
 *             example:
 *               success: false
 *               message: "Vendor already exists"
 *       503:
 *         description: Service temporarily unavailable due to an internal error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates request failure.
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message describing service unavailability.
 *                   example: "Vendor registration service temporarily unavailable"
 *             example:
 *               success: false
 *               message: "Vendor registration service temporarily unavailable"
 */
router.post(
    "/signup",
    authMiddleware,
    isAdminOrStaff,
    checkPermission(ModuleName.VENDOR, PermissionLevel.CREATE_EDIT),
    validateZod(vendorSignupSchema),
    vendorController.vendorSignup.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/request/register:
 *   post:
 *     summary: Register a new vendor
 *     description: Creates a new vendor account, sends a verification email with a token, and sets a JWT cookie for authentication.
 *     tags: [Vendors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - businessName
 *               - email
 *               - password
 *               - phoneNumber
 *               - district
 *               - businessRegNumber
 *               - taxDocuments
 *             properties:
 *               businessName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 description: Name of the vendor's business (required, 3-100 characters).
 *                 example: "ABC Electronics Store"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Valid email address for the vendor account (required, must be unique).
 *                 example: "vendor@abcelectronics.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 maxLength: 25
 *                 description: Secure password for account access (required, 8-25 characters).
 *                 example: "securepassword123"
 *               phoneNumber:
 *                 type: string
 *                 pattern: "^\\d{10}$"
 *                 description: Business contact phone number (required, 10 digits).
 *                 example: "9800000000"
 *               telePhone:
 *                 type: string
 *                 pattern: "^(?:\\d{9}|(?=(?:\\D*\\d){9}\\D*$)\\d+-\\d+)$"
 *                 description: Optional telephone number (9 digits, with or without one hyphen).
 *                 example: "01-1234567"
 *               district:
 *                 type: string
 *                 minLength: 1
 *                 description: District where the vendor's business is located (required).
 *                 example: "Kathmandu"
 *               businessRegNumber:
 *                 type: string
 *                 minLength: 1
 *                 description: Business registration number (required).
 *                 example: "BRN-12345"
 *               taxNumber:
 *                 type: string
 *                 description: Tax registration number (optional).
 *                 example: "PAN-123456"
 *               taxDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: Array of tax document URLs (required, at least 1).
 *                 example: ["https://example.com/tax.pdf"]
 *               citizenshipDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: Array of citizenship document URLs (optional).
 *                 example: ["https://example.com/citizenship.pdf"]
 *               accountName:
 *                 type: string
 *                 description: Bank account name (optional).
 *                 example: "ABC Store"
 *               bankName:
 *                 type: string
 *                 description: Bank name (optional).
 *                 example: "Nepal Bank"
 *               accountNumber:
 *                 type: string
 *                 description: Bank account number (optional).
 *                 example: "1234567890"
 *               bankBranch:
 *                 type: string
 *                 description: Bank branch (optional).
 *                 example: "Kathmandu"
 *               profilePicture:
 *                 type: string
 *                 format: uri
 *                 description: Profile picture URL (optional).
 *                 example: "https://example.com/logo.jpg"
 *           example:
 *             businessName: "ABC Electronics Store"
 *             email: "vendor@abcelectronics.com"
 *             password: "securepassword123"
 *             phoneNumber: "9800000000"
 *             district: "Kathmandu"
 *             businessRegNumber: "BRN-12345"
 *             taxDocuments: ["https://example.com/tax.pdf"]
 *     responses:
 *       201:
 *         description: Vendor registered successfully, verification email sent, and JWT cookie set.
 *         headers:
 *           Set-Cookie:
 *             description: HTTP-only authentication cookie containing the JWT token.
 *             schema:
 *               type: string
 *               example: "vendorToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=Strict; Max-Age=7200"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates successful vendor registration.
 *                   example: true
 *                 vendor:
 *                   type: object
 *                   description: Created vendor information.
 *                   properties:
 *                     id:
 *                       type: integer
 *                       description: Unique vendor identifier.
 *                       example: 1
 *                     businessName:
 *                       type: string
 *                       description: Name of the vendor's business.
 *                       example: "ABC Electronics Store"
 *                     email:
 *                       type: string
 *                       format: email
 *                       description: Vendor's email address.
 *                       example: "vendor@abcelectronics.com"
 *                     phoneNumber:
 *                       type: string
 *                       description: Vendor's phone number.
 *                       example: "+1234567890"
 *                     district:
 *                       type: string
 *                       description: District of the vendor's business.
 *                       example: "Downtown District"
 *                     verificationCode:
 *                       type: string
 *                       description: Hashed verification token for email verification.
 *                       example: "hashedToken123"
 *                     verificationCodeExpire:
 *                       type: string
 *                       format: date-time
 *                       description: Expiry date and time for the verification token (15 minutes from creation).
 *                       example: "2025-06-11T11:17:00.000Z"
 *                 token:
 *                   type: string
 *                   description: JWT authentication token (expires in 2 hours).
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *             example:
 *               success: true
 *               vendor:
 *                 id: 1
 *                 businessName: "ABC Electronics Store"
 *                 email: "vendor@abcelectronics.com"
 *                 phoneNumber: "+1234567890"
 *                 district: "Downtown District"
 *                 verificationCode: "hashedToken123"
 *                 verificationCodeExpire: "2025-06-11T11:17:00.000Z"
 *               token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: Invalid input data, validation errors, or district does not exist.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates request failure.
 *                   example: false
 *                 errors:
 *                   type: array
 *                   description: Array of validation errors (if applicable).
 *                   items:
 *                     type: object
 *                     properties:
 *                       path:
 *                         type: array
 *                         description: Field path that failed validation.
 *                         items:
 *                           type: string
 *                       message:
 *                         type: string
 *                         description: Validation error message.
 *                 message:
 *                   type: string
 *                   description: Error message (if district does not exist).
 *                   example: "District does not exists"
 *             example:
 *               success: false
 *               errors:
 *                 - path: ["businessName"]
 *                   message: "Business name must be at least 3 characters long"
 *       409:
 *         description: Vendor already exists with the provided email.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates request failure.
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message indicating conflict.
 *                   example: "Vendor already exists"
 *             example:
 *               success: false
 *               message: "Vendor already exists"
 *       503:
 *         description: Service temporarily unavailable due to an internal error.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates request failure.
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message describing service unavailability.
 *                   example: "Vendor registration service temporarily unavailable"
 *             example:
 *               success: false
 *               message: "Vendor registration service temporarily unavailable"
 */
router.post(
    "/request/register",
    validateZod(vendorSignupSchema),
    vendorController.vendorSignup.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/login:
 *   post:
 *     summary: Vendor login
 *     description: Authenticates vendor credentials and returns access token
 *     tags: [Vendors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Vendor's registered email address (required for authentication)
 *                 example: "vendor@abcelectronics.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 maxLength: 25
 *                 description: Vendor's account password (required, 8-25 characters)
 *                 example: "securepassword123"
 *           example:
 *             email: "vendor@abcelectronics.com"
 *             password: "securepassword123"
 *     responses:
 *       200:
 *         description: Login successful
 *         headers:
 *           Set-Cookie:
 *             description: HTTP-only authentication cookie
 *             schema:
 *               type: string
 *               example: "vendorToken=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...; HttpOnly; Secure; SameSite=Strict; Max-Age=7200"
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates successful authentication
 *                   example: true
 *                 vendor:
 *                   type: object
 *                   description: Authenticated vendor information
 *                   properties:
 *                     id:
 *                       type: integer
 *                       description: Unique vendor identifier
 *                       example: 1
 *                     email:
 *                       type: string
 *                       format: email
 *                       description: Vendor's email address
 *                       example: "vendor@abcelectronics.com"
 *                     businessName:
 *                       type: string
 *                       description: Name of the vendor's business
 *                       example: "ABC Electronics Store"
 *                     profilePicture:
 *                       type: string
 *                       format: uri
 *                       nullable: true
 *                       example: "https://cdn.example.com/vendor.jpg"
 *                 token:
 *                   type: string
 *                   description: JWT authentication token (expires in 2 hours)
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 refreshToken:
 *                   type: string
 *                   description: JWT refresh token (expires in 7 days)
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh"
 *             example:
 *               success: true
 *               vendor:
 *                 id: 1
 *                 email: "vendor@abcelectronics.com"
 *                 businessName: "ABC Electronics Store"
 *                 profilePicture: "https://cdn.example.com/vendor.jpg"
 *               token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               refreshToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.refresh"
 *       400:
 *         description: Invalid input data or validation errors
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates request failure
 *                   example: false
 *                 errors:
 *                   type: array
 *                   description: Array of validation errors
 *                   items:
 *                     type: object
 *                     properties:
 *                       path:
 *                         type: array
 *                         description: Field path that failed validation
 *                       message:
 *                         type: string
 *                         description: Validation error message
 *             example:
 *               success: false
 *               errors: [
 *                 {
 *                   "path": ["email"],
 *                   "message": "Invalid email format"
 *                 }
 *               ]
 *       401:
 *         description: Invalid credentials or vendor not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates authentication failure
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message describing authentication failure
 *                   example: "Invalid credentials"
 *             example:
 *               success: false
 *               message: "Invalid credentials"
 *       503:
 *         description: Service temporarily unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates request failure
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message describing service unavailability
 *                   example: "Authentication service temporarily unavailable"
 *             example:
 *               success: false
 *               message: "Authentication service temporarily unavailable"
 */
router.post(
    "/login",
    validateZod(vendorLoginSchema),
    vendorController.login.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/refresh-token:
 *   post:
 *     summary: Refresh vendor access token
 *     description: Issues a new vendor access token using the refresh token stored in the cookie.
 *     tags: [Vendors]
 *     responses:
 *       200:
 *         description: Access token refreshed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       401:
 *         description: Refresh token missing or invalid
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
 *                   example: "Refresh token missing or invalid"
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
router.post(
    "/refresh-token",
    vendorController.refreshToken.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/logout:
 *   post:
 *     summary: Log out the authenticated vendor
 *     description: Clears the vendor access and refresh token cookies.
 *     tags: [Vendors]
 *     responses:
 *       200:
 *         description: Logged out successfully
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
 *                   example: "Logged out successfully"
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
router.post("/logout", vendorController.logout.bind(vendorController));

// router.post('/verify/resend', authRateLimiter, validateZod(verificationTokenSchema), vendorController.sendVerificationToken.bind(vendorController));

// router.post('/verify', validateZod(verifyTokenSchema), vendorController.verifyToken.bind(vendorController));

/**
 * @swagger
 * /api/vendors/forgot-password:
 *   post:
 *     summary: Request vendor password reset
 *     description: Generates a six-digit reset token, stores it for 15 minutes, and emails it to the vendor. Rate limited to 5 requests per 15 minutes per IP. No authentication required.
 *     tags: [Vendors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Registered vendor email address
 *                 example: "vendor@abcelectronics.com"
 *     responses:
 *       202:
 *         description: Password reset email sent successfully
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
 *                   example: "Password reset request sent"
 *       400:
 *         description: Invalid email format
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
 *                   example: "Invalid email format"
 *       404:
 *         description: No vendor exists for submitted email. Response uses standard ApiError envelope.
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
 *                   example: "Vendor not found with this email"
 *       429:
 *         description: Too many requests - rate limit exceeded
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
 *                   example: "Too many requests. Please try again later."
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
router.post(
    "/forgot-password",
    authRateLimiter,
    validateZod(verificationTokenSchema),
    vendorController.forgotPassword.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/reset-password:
 *   post:
 *     summary: Reset vendor password with token
 *     description: Resets vendor password using six-digit token emailed by forgot-password. Token expires after 15 minutes, is single-use, and endpoint is rate limited to 5 requests per 15 minutes per IP. No authentication required.
 *     tags: [Vendors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - newPass
 *               - confirmPass
 *               - token
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Vendor email address
 *                 example: "vendor@abcelectronics.com"
 *               newPass:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 maxLength: 100
 *                 description: New password (8-100 characters)
 *                 example: "NewSecurePass123!"
 *               confirmPass:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 maxLength: 100
 *                 description: Confirm password; must match newPass
 *                 example: "NewSecurePass123!"
 *               token:
 *                 type: string
 *                 pattern: "^\\d{6}$"
 *                 description: Password reset token received via email (6 digits)
 *                 example: "123456"
 *     responses:
 *       200:
 *         description: Password reset successful
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
 *                   example: "Password reset successfully"
 *       400:
 *         description: Invalid token, password mismatch, or validation error
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
 *                   example: "Invalid or expired reset token"
 *       404:
 *         description: Vendor not found
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
 *                   example: "Vendor not found"
 *       410:
 *         description: Reset token missing or expired. Response uses standard ApiError envelope.
 *       429:
 *         description: Too many requests - rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.post(
    "/reset-password",
    authRateLimiter,
    validateZod(resetPasswordSchema),
    vendorController.resetPassword.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/{id}:
 *   put:
 *     summary: Update vendor information
 *     description: Updates vendor profile information. Requires authentication and authorization (vendor can only update their own profile, or admin can update any vendor)
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 1
 *         description: Unique identifier of the vendor to update
 *         example: 123
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               businessName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 description: Name of the vendor's business (optional)
 *                 example: "Acme Food Supplies"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Vendor's email address (optional)
 *                 example: "vendor@acmefood.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 maxLength: 25
 *                 description: New password (optional, 8-25 characters)
 *                 example: "newSecurePass123"
 *               phoneNumber:
 *                 type: string
 *                 pattern: "^\\d{10}$"
 *                 description: Vendor's contact phone number (optional, 10 digits)
 *                 example: "9800000000"
 *               telePhone:
 *                 type: string
 *                 pattern: "^(?:\\d{9}|(?=(?:\\D*\\d){9}\\D*$)\\d+-\\d+)$"
 *                 description: Optional telephone number (9 digits, with or without one hyphen)
 *                 example: "01-1234567"
 *               district:
 *                 type: string
 *                 minLength: 1
 *                 description: District (optional)
 *                 example: "Kathmandu"
 *               businessRegNumber:
 *                 type: string
 *                 minLength: 1
 *                 description: Business registration number (optional)
 *                 example: "BRN-12345"
 *               taxNumber:
 *                 type: string
 *                 description: Tax registration number (optional)
 *                 example: "PAN-123456"
 *               taxDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: Tax document URLs (optional)
 *                 example: ["https://example.com/tax.pdf"]
 *               citizenshipDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 description: Citizenship document URLs (optional)
 *                 example: ["https://example.com/citizenship.pdf"]
 *               accountName:
 *                 type: string
 *                 description: Bank account name (optional)
 *                 example: "Acme Food Supplies"
 *               bankName:
 *                 type: string
 *                 description: Bank name (optional)
 *                 example: "Nepal Bank"
 *               accountNumber:
 *                 type: string
 *                 description: Bank account number (optional)
 *                 example: "1234567890"
 *               bankBranch:
 *                 type: string
 *                 description: Bank branch (optional)
 *                 example: "Kathmandu"
 *               profilePicture:
 *                 type: string
 *                 format: uri
 *                 description: Profile picture URL (optional)
 *                 example: "https://example.com/logo.jpg"
 *           example:
 *             businessName: "Acme Food Supplies"
 *             email: "vendor@acmefood.com"
 *             phoneNumber: "9800000000"
 *             district: "Kathmandu"
 *     responses:
 *       200:
 *         description: Vendor updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates successful vendor update
 *                   example: true
 *                 message:
 *                   type: string
 *                   description: Success message confirming vendor update
 *                   example: "Vendor updated successfully"
 *                 data:
 *                   type: object
 *                   description: Updated vendor information
 *                   properties:
 *                     id:
 *                       type: integer
 *                       description: Vendor's unique identifier
 *                       example: 123
 *                     businessName:
 *                       type: string
 *                       description: Name of the vendor's business
 *                       example: "Acme Food Supplies"
 *                     email:
 *                       type: string
 *                       format: email
 *                       description: Vendor's email address
 *                       example: "vendor@acmefood.com"
 *                     businessAddress:
 *                       type: string
 *                       description: Physical address of the business
 *                       example: "123 Main Street, City, State 12345"
 *                     phoneNumber:
 *                       type: string
 *                       description: Vendor's contact phone number
 *                       example: "+1-555-123-4567"
 *             example:
 *               success: true
 *               message: "Vendor updated successfully"
 *               data:
 *                 id: 123
 *                 businessName: "Acme Food Supplies"
 *                 email: "vendor@acmefood.com"
 *                 businessAddress: "123 Main Street, City, State 12345"
 *                 phoneNumber: "+1-555-123-4567"
 *       400:
 *         description: Invalid input data, validation errors, or ID mismatch
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       description: Indicates request failure
 *                       example: false
 *                     errors:
 *                       type: array
 *                       description: Array of validation errors from Zod schema
 *                       items:
 *                         type: object
 *                         properties:
 *                           path:
 *                             type: array
 *                             description: Field path that failed validation
 *                           message:
 *                             type: string
 *                             description: Validation error message
 *                 - type: object
 *                   properties:
 *                     success:
 *                       type: boolean
 *                       description: Indicates request failure
 *                       example: false
 *                     message:
 *                       type: string
 *                       description: Error message for specific validation failure
 *             examples:
 *               validationErrors:
 *                 summary: Zod validation errors
 *                 value:
 *                   success: false
 *                   errors: [
 *                     {
 *                       "path": ["email"],
 *                       "message": "Invalid email format"
 *                     }
 *                   ]
 *               invalidId:
 *                 summary: Invalid vendor ID
 *                 value:
 *                   success: false
 *                   message: "Invalid vendor ID"
 *               idMismatch:
 *                 summary: ID mismatch between URL and body
 *                 value:
 *                   success: false
 *                   message: "ID in body must match URL parameter"
 *       401:
 *         description: Authentication required
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates authentication failure
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Authentication error message
 *                   example: "Authentication required"
 *             example:
 *               success: false
 *               message: "Authentication required"
 *       403:
 *         description: Insufficient permissions to update this vendor
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates authorization failure
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Authorization error message
 *                   example: "Insufficient permissions to update this vendor"
 *             example:
 *               success: false
 *               message: "Insufficient permissions to update this vendor"
 *       404:
 *         description: Vendor not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates vendor not found
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message indicating vendor not found
 *                   example: "Vendor not found"
 *             example:
 *               success: false
 *               message: "Vendor not found"
 *       503:
 *         description: Service temporarily unavailable
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Indicates service unavailability
 *                   example: false
 *                 message:
 *                   type: string
 *                   description: Error message indicating service status
 *                   example: "Vendor update service temporarily unavailable"
 *             example:
 *               success: false
 *               message: "Vendor update service temporarily unavailable"
 */
router.put(
    "/:id",
    combinedAuthMiddleware,
    restrictToVendorOrAdmin,
    validateZod(updateVendorSchema),
    vendorController.updateVendor.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/approve/{id}:
 *   put:
 *     summary: Approve a vendor
 *     description: Approves a verified vendor. Only accessible by admin or staff. Vendor must be verified before approval.
 *     tags:
 *       - Vendors
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the vendor to approve
 *     responses:
 *       200:
 *         description: Vendor successfully approved
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
 *                   example: "Vendor approved ✅"
 *       400:
 *         description: Vendor not verified or approval failed
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
 *                   example: "Vendor must be verified"
 *       503:
 *         description: Service temporarily unavailable
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
 *                   example: "Vendor update service temporarily unavailable"
 */
router.put(
    "/approve/:id",
    authMiddleware,
    isAdminOrStaff,
    checkPermission(ModuleName.VENDOR, PermissionLevel.CREATE_EDIT),
    vendorController.approveVendor.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/reject/{id}:
 *   put:
 *     summary: Reject a vendor
 *     description: Rejects a verified vendor. Only accessible by admin or staff.
 *     tags:
 *       - Vendors
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the vendor to reject
 *     responses:
 *       200:
 *         description: Vendor successfully rejected
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
 *                   example: "Vendor Rejected"
 *       400:
 *         description: Vendor rejection failed
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
 *                   example: "Vendor rejection failed"
 *       503:
 *         description: Service temporarily unavailable
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
 *                   example: "Vendor update service temporarily unavailable"
 */
router.put(
    "/reject/:id",
    authMiddleware,
    isAdminOrStaff,
    checkPermission(ModuleName.VENDOR, PermissionLevel.CREATE_EDIT),
    vendorController.rejectVendor.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/{id}:
 *   delete:
 *     summary: Delete a vendor by ID
 *     description: Permanently deletes a vendor from the system. Only accessible by admin or staff.
 *     tags:
 *       - Vendors
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the vendor to delete
 *     responses:
 *       200:
 *         description: Vendor successfully deleted
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
 *                   example: "Vendor deleted"
 *       404:
 *         description: Vendor not found
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
 *                   example: "Vendor doesnot exists"
 *       503:
 *         description: Service temporarily unavailable
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
 *                   example: "Vendor update service temporarily unavailable"
 */
router.delete(
    "/:id",
    authMiddleware,
    isAdminOrStaff,
    checkPermission(ModuleName.VENDOR, PermissionLevel.DELETE),
    vendorController.deleteVendor.bind(vendorController),
);

// ---------------------------- v2 routes ------------------------------------------------------------------------------------

/**
 * @swagger
 * /api/vendors/request/register-v2:
 *   post:
 *     summary: Register a new vendor (v2)
 *     description: Allows a prospective vendor to submit a registration request using the v2 schema.
 *     tags: [Vendors]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - businessName
 *               - email
 *               - password
 *               - phoneNumber
 *               - district
 *               - businessRegNumber
 *               - taxDocuments
 *             properties:
 *               businessName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: "Fresh Farms"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "vendor@freshfarms.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 maxLength: 100
 *                 example: "SecurePass123!"
 *               phoneNumber:
 *                 type: string
 *                 pattern: "^\\d{10}$"
 *                 description: Phone number (10 digits)
 *                 example: "9800000000"
 *               telePhone:
 *                 type: string
 *                 pattern: "^(?:\\d{9}|(?=(?:\\D*\\d){9}\\D*$)\\d+-\\d+)$"
 *                 description: Optional telephone number (9 digits, with or without one hyphen)
 *                 example: "01-1234567"
 *               district:
 *                 type: string
 *                 minLength: 1
 *                 example: "Kathmandu"
 *               businessRegNumber:
 *                 type: string
 *                 minLength: 1
 *                 example: "BRN-12345"
 *               taxNumber:
 *                 type: string
 *                 example: "PAN-123456"
 *               taxDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 example: ["https://example.com/tax.pdf"]
 *               citizenshipDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 example: ["https://example.com/citizenship.pdf"]
 *               accountName:
 *                 type: string
 *                 example: "Fresh Farms"
 *               bankName:
 *                 type: string
 *                 example: "Nepal Bank"
 *               accountNumber:
 *                 type: string
 *                 example: "1234567890"
 *               bankBranch:
 *                 type: string
 *                 example: "Kathmandu"
 *               paymentOptions:
 *                 type: array
 *                 description: Optional payment options. Payment types must be unique.
 *                 items:
 *                   type: object
 *                   required: [paymentType]
 *                   properties:
 *                     paymentType:
 *                       type: string
 *                       enum: [ESEWA, KHALTI, NPS, BANK]
 *                       example: "ESEWA"
 *                     accountName:
 *                       type: string
 *                       example: "Fresh Farms"
 *                     accountNumber:
 *                       type: string
 *                       example: "9800000000"
 *                     bankName:
 *                       type: string
 *                       example: "Nepal Bank"
 *                     bankBranch:
 *                       type: string
 *                       example: "Kathmandu"
 *     responses:
 *       201:
 *         description: Vendor registration request submitted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [success, message, token]
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string, example: "Your account has been successfully registered. Our admin team will review your application within 5 business days" }
 *                 token: { type: string, description: Short-lived vendor access JWT, example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." }
 *       400:
 *         description: Validation error
 *       409:
 *         description: Email already in use
 *       500:
 *         description: Internal server error
 */
router.post(
    "/request/register-v2",
    validateZod(vendorSignupSchemav2),
    vendorController.vendorSignupV2.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/v2/{id}:
 *   put:
 *     summary: Update vendor profile (v2)
 *     description: Updates vendor profile using the v2 schema. Requires authentication as the vendor owner or admin.
 *     tags: [Vendors]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Vendor ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               businessName:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 100
 *                 example: "Fresh Farms Updated"
 *               phoneNumber:
 *                 type: string
 *                 pattern: "^\\d{10}$"
 *                 description: Phone number (10 digits)
 *                 example: "9811111111"
 *               telePhone:
 *                 type: string
 *                 nullable: true
 *                 pattern: "^(?:\\d{9}|(?=(?:\\D*\\d){9}\\D*$)\\d+-\\d+)$"
 *                 description: Optional telephone number (9 digits, with or without one hyphen; set to null to clear)
 *                 example: "01-1234567"
 *               taxNumber:
 *                 type: string
 *                 example: "PAN-123456"
 *               taxDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 example: ["https://example.com/tax.pdf"]
 *               citizenshipDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *                 example: ["https://example.com/citizenship.pdf"]
 *               district:
 *                 type: string
 *                 example: "Kathmandu"
 *               profilePicture:
 *                 type: string
 *                 format: uri
 *                 nullable: true
 *                 description: Profile picture URL
 *                 example: "https://example.com/logo.jpg"
 *               paymentOptions:
 *                 type: array
 *                 items:
 *                   type: object
 *                 description: Vendor payment options
 *     responses:
 *       200:
 *         description: Vendor updated successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Vendor updated successfully"
 *               data: { id: 12, businessName: "Fresh Farms Updated", email: "vendor@freshfarms.com" }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Vendor not found
 *       500:
 *         description: Internal server error
 */
router.put(
    "/v2/:id",
    combinedAuthMiddleware,
    restrictToVendorOrAdmin,
    validateZod(updateVendorSchema2, "body"),
    vendorController.updateVendorV2.bind(vendorController),
);

/**
 * @swagger
 * /api/vendors/{vendorId}/payment-options/{paymentOptionId}:
 *   patch:
 *     summary: Update a vendor's payment option
 *     description: Update specific payment option details for a vendor. Requires authentication as the vendor owner or admin.
 *     tags: [Vendors]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Vendor ID
 *       - in: path
 *         name: paymentOptionId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Payment option ID to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               details:
 *                 type: object
 *                 description: Payment option details (key-value pairs)
 *                 example: {"accountName": "Fresh Farms Business", "walletNumber": "9800000000"}
 *               qrCodeImage:
 *                 type: string
 *                 format: uri
 *                 nullable: true
 *                 description: QR code image URL
 *                 example: "https://example.com/qr.png"
 *               isActive:
 *                 type: boolean
 *                 description: Whether this payment option is active
 *                 example: true
 *     responses:
 *       200:
 *         description: Payment option updated successfully
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: "Payment option updated successfully"
 *               data: { id: 4, paymentType: "ESEWA", isActive: true, details: { accountName: "Fresh Farms Business" } }
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Vendor or payment option not found
 *       500:
 *         description: Internal server error
 */
router.patch(
    "/:vendorId/payment-options/:paymentOptionId",
    combinedAuthMiddleware,
    restrictToVendorOrAdmin,
    validateZod(updateVendorPaymentOptionSchema),
    vendorController.updatePaymentOption.bind(vendorController),
);

export default router;
