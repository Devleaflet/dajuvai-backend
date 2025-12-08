import { Router } from 'express';
import { VendorController } from '../controllers/vendor.controller';
import { authMiddleware, combinedAuthMiddleware, isAdmin, isAdminOrStaff, isVendor, restrictToVendorOrAdmin, vendorAuthMiddleware } from '../middlewares/auth.middleware';
import {
    vendorSignupSchema,
    vendorLoginSchema,
    verificationTokenSchema,
    verifyTokenSchema,
    resetPasswordSchema,
    updateVendorSchema,
} from '../utils/zod_validations/vendor.zod';

import rateLimit from 'express-rate-limit';
import { validateZod } from '../middlewares/auth.middleware';
import { ProductController } from '../controllers/product.controller';
import AppDataSource from '../config/db.config';

const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per window
    message: 'Too many requests, please try again later.',
});

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

router.get('/', authMiddleware, isAdminOrStaff, vendorController.getVendors.bind(vendorController));

router.get('/partial/vendors', vendorController.getPartialVendors.bind(vendorController));

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
router.get("/unapprove/list", authMiddleware, isAdminOrStaff, vendorController.getUnapprovedVendorList.bind(vendorController));


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
router.get('/:vendorId/products', productController.getProductsByVendorId.bind(productController));

/**
 * @swagger
 * /api/vendors/{id}:
 *   get:
 *     summary: Get vendor by ID
 *     description: Retrieves a single vendor's details using the vendor ID. Accessible by authenticated admins.
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
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
router.get('/:id', vendorController.getVendorById.bind(vendorController));

// /api/vendors/auth/vendor
router.get('/auth/vendor', vendorAuthMiddleware, isVendor, vendorController.authVendor.bind(vendorController));

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
 *                 maxLength: 100
 *                 description: Secure password for account access (required, 8-100 characters).
 *                 example: "securepassword123"
 *               phoneNumber:
 *                 type: string
 *                 pattern: "^\\+?[1-9]\\d{1,14}$"
 *                 description: Business contact phone number (required, international format supported).
 *                 example: "+1234567890"
 *               district:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: District where the vendor's business is located (required, must match an existing district).
 *                 example: "Downtown District"
 *           example:
 *             businessName: "ABC Electronics Store"
 *             email: "vendor@abcelectronics.com"
 *             password: "securepassword123"
 *             phoneNumber: "+1234567890"
 *             district: "Downtown District"
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
router.post('/signup', authMiddleware, isAdmin, validateZod(vendorSignupSchema), vendorController.vendorSignup.bind(vendorController));

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
 *                 maxLength: 100
 *                 description: Secure password for account access (required, 8-100 characters).
 *                 example: "securepassword123"
 *               phoneNumber:
 *                 type: string
 *                 pattern: "^\\+?[1-9]\\d{1,14}$"
 *                 description: Business contact phone number (required, international format supported).
 *                 example: "+1234567890"
 *               district:
 *                 type: string
 *                 minLength: 2
 *                 maxLength: 100
 *                 description: District where the vendor's business is located (required, must match an existing district).
 *                 example: "Downtown District"
 *           example:
 *             businessName: "ABC Electronics Store"
 *             email: "vendor@abcelectronics.com"
 *             password: "securepassword123"
 *             phoneNumber: "+1234567890"
 *             district: "Downtown District"
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
router.post("/request/register", validateZod(vendorSignupSchema), vendorController.vendorSignup.bind(vendorController))

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
 *                 maxLength: 15
 *                 description: Vendor's account password (required, 8-15 characters)
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
 *                 token:
 *                   type: string
 *                   description: JWT authentication token (expires in 2 hours)
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *             example:
 *               success: true
 *               vendor:
 *                 id: 1
 *                 email: "vendor@abcelectronics.com"
 *                 businessName: "ABC Electronics Store"
 *               token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
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
router.post('/login', validateZod(vendorLoginSchema), vendorController.login.bind(vendorController));

// router.post('/verify/resend', authRateLimiter, validateZod(verificationTokenSchema), vendorController.sendVerificationToken.bind(vendorController));

// router.post('/verify', validateZod(verifyTokenSchema), vendorController.verifyToken.bind(vendorController));


// router.post('/forgot-password', authRateLimiter, validateZod(verificationTokenSchema), vendorController.forgotPassword.bind(vendorController));


// router.post('/reset-password', authRateLimiter, vendorController.resetPassword.bind(vendorController));

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
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: integer
 *                 minimum: 1
 *                 description: Vendor ID that must match the URL parameter (required)
 *                 example: 123
 *               businessName:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 255
 *                 description: Name of the vendor's business (optional)
 *                 example: "Acme Food Supplies"
 *               email:
 *                 type: string
 *                 format: email
 *                 maxLength: 255
 *                 description: Vendor's email address (optional)
 *                 example: "vendor@acmefood.com"
 *               businessAddress:
 *                 type: string
 *                 maxLength: 500
 *                 description: Physical address of the business (optional)
 *                 example: "123 Main Street, City, State 12345"
 *               phoneNumber:
 *                 type: string
 *                 pattern: "^[+]?[0-9\\s\\-\\(\\)]{10,20}$"
 *                 description: Vendor's contact phone number (optional)
 *                 example: "+1-555-123-4567"
 *           example:
 *             id: 123
 *             businessName: "Acme Food Supplies"
 *             email: "vendor@acmefood.com"
 *             businessAddress: "123 Main Street, City, State 12345"
 *             phoneNumber: "+1-555-123-4567"
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
router.put('/:id', combinedAuthMiddleware, restrictToVendorOrAdmin, validateZod(updateVendorSchema), vendorController.updateVendor.bind(vendorController));


/**
 * @swagger
 * /api/vendors/approve/{id}:
 *   put:
 *     summary: Approve a vendor
 *     description: Approves a verified vendor. Only accessible by admin or staff. Vendor must be verified before approval.
 *     tags:
 *       - Vendors
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
router.put("/approve/:id", authMiddleware, isAdminOrStaff, vendorController.approveVendor.bind(vendorController));

/**
 * @swagger
 * /api/vendors/{id}:
 *   delete:
 *     summary: Delete a vendor by ID
 *     description: Permanently deletes a vendor from the system. Only accessible by admin or staff.
 *     tags:
 *       - Vendors
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
router.delete("/:id", authMiddleware, isAdmin, vendorController.deleteVendor.bind(vendorController));

export default router;