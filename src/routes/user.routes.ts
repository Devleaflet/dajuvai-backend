import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import passport from 'passport';
import { UserController } from '../controllers/user.controller';
import { authMiddleware, isAccountOwner, isAdmin, isAdminOrStaff, validateZod } from '../middlewares/auth.middleware';
import { adminResetPasswordSchema, changeEmailSchema, loginSchema, resetPasswordSchema, signupSchema, verificationTokenSchema, verifyEmailChangeSchema, verifyTokenSchema } from '../utils/zod_validations/user.zod';
import { deleteUserDataByFacebookId } from '../service/user.service';
import { APIError } from '../utils/ApiError.utils';
import { UserRole } from '../entities/user.entity';
import config from '../config/env.config';
import jwt from "jsonwebtoken"

const userRouter = Router();
const userController = new UserController();

const frontendUrl = config.FRONTEND_URL;


// Rate limiter for sensitive endpoints
const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per window
    message: 'Too many requests, please try again later.',
});

/**
 * @swagger
 * /api/auth/admin/signup:
 *   post:
 *     summary: Register a new admin user
 *     description: Creates a new admin account with a secure hashed password and sets a JWT cookie.
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - confirmPassword
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin_user
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: StrongPassword123
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 example: StrongPassword123
 *     responses:
 *       201:
 *         description: Admin user registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     username:
 *                       type: string
 *                       example: admin_user
 *                     email:
 *                       type: string
 *                       example: admin@example.com
 *                     role:
 *                       type: string
 *                       example: ADMIN
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: Validation error (e.g., invalid email, password mismatch)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       path:
 *                         type: array
 *                         items:
 *                           type: string
 *                         example: ["email"]
 *                       message:
 *                         type: string
 *                         example: "Invalid email format"
 *       503:
 *         description: Registration service unavailable
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
 *                   example: "Registration service temporarily unavailable"
 */
userRouter.post("/admin/signup", userController.adminSignup.bind(userController));

/**
 * @swagger
 * /api/auth/signup/staff:
 *   post:
 *     summary: Register a new staff user (admin-only)
 *     tags: [Authentication]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - confirmPassword
 *             properties:
 *               username:
 *                 type: string
 *                 example: staff_user
 *               email:
 *                 type: string
 *                 format: email
 *                 example: staff@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: Password123!@#
 *               confirmPassword:
 *                 type: string
 *                 format: password
 *                 minLength: 8
 *                 example: Password123!@#
 *     responses:
 *       201:
 *         description: Staff user registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                       example: 101
 *                     username:
 *                       type: string
 *                       example: staff_user
 *                     email:
 *                       type: string
 *                       example: staff@example.com
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *       400:
 *         description: Validation error (invalid input)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       message:
 *                         type: string
 *                         example: "Username is required"
 *       409:
 *         description: Email already in use
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
 *                   example: User with this email already exists
 *       503:
 *         description: Registration service temporarily unavailable
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
 *                   example: Registration service temporarily unavailable
 */
userRouter.post("/signup/staff", authMiddleware, isAdmin, userController.staffSignup.bind(userController));

/**
 * @swagger
 * /api/auth/staff:
 *   get:
 *     summary: Get all staff members
 *     description: Returns a list of all users with the `staff` role. Requires admin authentication.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved staff list
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
 *                         example: 4
 *                       username:
 *                         type: string
 *                         example: "staff"
 *                       email:
 *                         type: string
 *                         example: "staff@gmail.com"
 *                       role:
 *                         type: string
 *                         example: "staff"
 *                       addressId:
 *                         type: integer
 *                         nullable: true
 *                         example: null
 *                       googleId:
 *                         type: string
 *                         nullable: true
 *                         example: null
 *                       facebookId:
 *                         type: string
 *                         nullable: true
 *                         example: null
 *                       provider:
 *                         type: string
 *                         example: "local"
 *                       isVerified:
 *                         type: boolean
 *                         example: true
 *                       password:
 *                         type: string
 *                         description: "Hashed password"
 *                         example: "$2b$10$8Xz7qX9o4Buh4Nv4UpVuDuOx5pZRzh18kSM45O1xNZqLHZcP2M7Tm"
 *                       verificationCode:
 *                         type: string
 *                         nullable: true
 *                         example: null
 *                       verificationCodeExpire:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                         example: null
 *                       resetToken:
 *                         type: string
 *                         nullable: true
 *                         example: null
 *                       resetTokenExpire:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                         example: null
 *                       resendCount:
 *                         type: integer
 *                         example: 0
 *                       resendBlockUntil:
 *                         type: string
 *                         format: date-time
 *                         nullable: true
 *                         example: null
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-08-14T10:14:24.780Z"
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                         example: "2025-08-14T10:14:24.780Z"
 *                       address:
 *                         type: object
 *                         nullable: true
 *                         example: null
 *       401:
 *         description: Unauthorized - No token or invalid token
 *       403:
 *         description: Forbidden - Only admins can access this resource
 *       500:
 *         description: Internal server error
 */
userRouter.get("/staff", userController.getAllStaff.bind(userController));


/**
 * @swagger
 * /api/auth/staff/{id}:
 *   delete:
 *     summary: Delete a staff member
 *     description: Permanently deletes a staff member by their ID. Only accessible by admins.
 *     tags:
 *       - Admin
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The ID of the staff member to delete
 *     responses:
 *       200:
 *         description: Staff deleted successfully
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
 *                   example: Staff deleted successfully
 *       404:
 *         description: Staff does not exist
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
 *                   example: Staff does not exist
 *       401:
 *         description: Unauthorized - User is not authenticated
 *       403:
 *         description: Forbidden - User is not an admin
 *       500:
 *         description: Internal server error
 */
userRouter.delete("/staff/:id", authMiddleware, isAdmin, userController.deleteStaff.bind(userController))

/**
 * @swagger
 * /api/auth/staff/{id}:
 *   put:
 *     summary: Update a staff member by ID
 *     description: Update information of a staff user. Only accessible by admins.
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the staff member to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: object
 *                 description: Fields to update for the staff user
 *                 example:
 *                   username: "newStaffName"
 *                   email: "newstaff@example.com"
 *     responses:
 *       200:
 *         description: Staff updated successfully
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
 *                   example: "Staff updated successfully"
 *       400:
 *         description: Bad request - invalid data
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
 *                   example: "Invalid data provided"
 *       401:
 *         description: Unauthorized - user not authenticated
 *       403:
 *         description: Forbidden - user is not an admin
 *       404:
 *         description: Staff not found
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
 *                   example: "Staff does not exist"
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
userRouter.put("/staff/:id", authMiddleware, isAdmin, userController.updateStaff.bind(userController))



/**
 * @swagger
 * /api/auth/admin/login:
 *   post:
 *     summary: Admin login
 *     description: Authenticates an admin user and sets a JWT cookie upon success.
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: admin_user
 *               password:
 *                 type: string
 *                 format: password
 *                 example: StrongPassword123
 *     responses:
 *       200:
 *         description: Admin logged in successfully
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
 *                   example: Admin logged in successfully
 *                 token:
 *                   type: string
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                       example: 1
 *                     username:
 *                       type: string
 *                       example: admin_user
 *                     email:
 *                       type: string
 *                       example: admin@example.com
 *                     role:
 *                       type: string
 *                       example: ADMIN
 *       401:
 *         description: Invalid credentials
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
 *                   example: Invalid credentials
 *       403:
 *         description: Access denied for non-admin user
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
 *                   example: "Access denied: not an admin"
 *       404:
 *         description: User not found
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
 *                   example: User not found
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
 *                   example: Internal server error
 */
userRouter.post("/admin/login", userController.adminLogin.bind(userController));

/**
 * @swagger
 * /api/auth/users:
 *   get:
 *     summary: Get all users
 *     description: Retrieves a list of all users. Admin access only.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of users
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: number
 *                     description: User ID
 *                   username:
 *                     type: string
 *                     description: Username
 *                   email:
 *                     type: string
 *                     description: User email
 *                   role:
 *                     type: string
 *                     enum: [admin, user, customer]
 *                     description: User role
 *                   isVerified:
 *                     type: boolean
 *                     description: Email verification status
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                     description: Account creation date
 *                   updatedAt:
 *                     type: string
 *                     format: date-time
 *                     description: Account last update date
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       403:
 *         description: Forbidden - Not an admin
 */
userRouter.get('/users', userController.getUsers.bind(userController));
//authMiddleware, isAdminOrStaff,


/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user account
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username for the account
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email address
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password (min 8 characters)
 *               role:
 *                 type: string
 *                 enum: [admin, user, customer]
 *                 description: User role (optional)
 *           example:
 *             username: "johndoe"
 *             email: "admin@gmail.com"
 *             password: "Password123!@#"
 *             confirmPassword: "Password123!@#"
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User registered successfully. Please verify your email.
 *                 userId:
 *                   type: number
 *                   description: ID of the newly created user
 *                 username:
 *                   type: string
 *                   description: Username of the newly created user
 *             example:
 *               message: "User registered successfully. Please verify your email."
 *               userId: 1
 *               username: "johndoe"
 *       400:
 *         description: Invalid input data
 *       409:
 *         description: Email or username already in use
 */
userRouter.post('/signup', validateZod(signupSchema), userController.signup.bind(userController));

/**
 * @swagger
 * /api/auth/verify/resend:
 *   post:
 *     summary: Resend email verification token
 *     description: Sends a new verification token to the user's email
 *     tags: [Authentication]
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
 *                 description: Email address to send verification token to
 *           example:
 *             email: "admin@gmail.com"
 *     responses:
 *       200:
 *         description: Verification email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Verification email sent successfully
 *             example:
 *               message: "Verification email sent successfully"
 *       400:
 *         description: Invalid email
 *       404:
 *         description: User not found
 *       429:
 *         description: Too many requests, please try again later
 */
userRouter.post('/verify/resend', authRateLimiter, validateZod(verificationTokenSchema), userController.sendVerificationToken.bind(userController));

/**
 * @swagger
 * /api/auth/verify:
 *   post:
 *     summary: Verify email verification token
 *     description: Verifies the user's email with a token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - token
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User's email address
 *               token:
 *                 type: string
 *                 description: Email verification token
 *           example:
 *             email: "admin@gmail.com"
 *             token: "123456"
 *     responses:
 *       200:
 *         description: Email verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Email verified successfully
 *             example:
 *               message: "Email verified successfully"
 *       400:
 *         description: Invalid token
 *       404:
 *         description: Token not found
 *       410:
 *         description: Token expired
 */
userRouter.post('/verify', validateZod(verifyTokenSchema), userController.verifyToken.bind(userController));

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     summary: User login
 *     description: Authenticates a user and returns a JWT token
 *     tags: [Authentication]
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
 *                 description: User email address
 *               password:
 *                 type: string
 *                 format: password
 *                 description: User password
 *           example:
 *             email: "admin@gmail.com"
 *             password: "Password123!@#"
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   description: JWT authentication token
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                       description: User ID
 *                     username:
 *                       type: string
 *                       description: Username
 *                     email:
 *                       type: string
 *                       description: User email
 *                     role:
 *                       type: string
 *                       enum: [admin, user, customer]
 *                       description: User role
 *                     isVerified:
 *                       type: boolean
 *                       description: Email verification status
 *             example:
 *               token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *               user:
 *                 id: 1
 *                 username: "johndoe"
 *                 email: "admin@gmail.com"
 *                 role: "user"
 *                 isVerified: true
 *       400:
 *         description: Invalid credentials
 *       401:
 *         description: Email not verified
 */
userRouter.post('/login', validateZod(loginSchema), userController.login.bind(userController));

/**
 * @swagger
 * /api/auth/refresh-token:
 *   post:
 *     summary: Refresh access token using refresh token cookie
 *     description: Issues a new access token by validating the refresh token stored in the cookie.
 *     tags: [Authentication]
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
 *       500:
 *         description: Internal server error
 */
userRouter.post('/refresh-token', userController.refreshToken.bind(userController));

/**
 * @swagger
 * /api/auth/logout:
 *   post:
 *     summary: Log out the authenticated user
 *     description: Clears the access token and refresh token cookies, effectively logging the user out.
 *     tags: [Authentication]
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
 */
userRouter.post('/logout', userController.logout.bind(userController));

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Google OAuth login
 *     description: Initiates the Google OAuth authentication flow
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirects to Google authentication page
 */
userRouter.get('/google', passport.authenticate('google', { scope: ['email', 'profile'] }));

/**
 * @swagger
 * /api/auth/google/mobile:
 *   post:
 *     tags: [Auth]
 *     summary: Google Sign-In for mobile apps
 *     description: >
 *       Mobile apps (React Native, Flutter, Android, iOS) use the Google Sign-In SDK
 *       to obtain an idToken natively, then POST it here. No browser redirect needed.
 *       Returns access token + refresh token directly in the response body.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: Google ID token obtained from Google Sign-In SDK on the mobile device
 *     responses:
 *       200:
 *         description: Successfully authenticated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                   description: Short-lived access token (15 min)
 *                 refreshToken:
 *                   type: string
 *                   description: Long-lived refresh token (7 days)
 *                 data:
 *                   type: object
 *                   properties:
 *                     userId:
 *                       type: integer
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *       400:
 *         description: idToken missing or email linked to different provider
 *       401:
 *         description: Invalid or expired Google token
 */
userRouter.post('/google/mobile', userController.googleMobileLogin.bind(userController));

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google OAuth callback handler
 *     description: Handles the callback from Google OAuth. Sets a JWT cookie and redirects to the frontend.
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirects to frontend with token on success, or with error on failure
 */
userRouter.get(
    "/google/callback",

    passport.authenticate("google", {
        session: false,
        failureRedirect: `${frontendUrl}/auth/google/callback?error=authentication_error`,
    }),

    async (req: any, res: Response) => {
        try {
            const { user } = req.user;

            if (!user) {
                console.error("Google OAuth failed - no user");

                return res.redirect(
                    `${frontendUrl}/auth/google/callback?error=authentication_error`
                );
            }

            const token = jwt.sign(
                {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                },
                config.JWT_SECRET,
                {
                    expiresIn: "15m",
                }
            );

            const refreshToken = jwt.sign(
                {
                    id: user.id,
                    email: user.email,
                    role: user.role,
                },
                config.JWT_REFRESH_SECRET,
                {
                    expiresIn: "1d",
                }
            );

            res.cookie("token", token, {
                httpOnly: true,
                secure: config.NODE_ENV === "production",
                sameSite: "none",
                maxAge: 15 * 60 * 1000,
            });

            res.cookie("refreshToken", refreshToken, {
                httpOnly: true,
                secure: config.NODE_ENV === "production",
                sameSite: "none",
                maxAge: 24 * 60 * 60 * 1000,
            });

            // Redirect to frontend callback with token and refreshToken
            res.redirect(`${frontendUrl}/auth/google/callback?token=${token}&refreshToken=${refreshToken}`);

        } catch (error) {
            console.error("Google OAuth callback error:", error);

            res.redirect(
                `${frontendUrl}/auth/google/callback?error=authentication_error`
            );
        }
    }
);


/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Retrieve the authenticated user's details
 *     description: Returns the current user's information (userId, email, and role) based on the JWT token stored in the httpOnly cookie.
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Successful response with user details
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
 *                     userId:
 *                       type: integer
 *                       example: 2
 *                       description: The unique identifier of the user
 *                     email:
 *                       type: string
 *                       example: thapanirajan789@gmail.com
 *                       description: The email address of the user
 *                     role:
 *                       type: string
 *                       example: user
 *                       description: The role of the user (defaults to 'user' if not set)
 *       '401':
 *         description: Unauthorized - Invalid or missing JWT token
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
 *       '500':
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
 *                   example: Internal server error
 *     securityDefinitions:
 *       bearerAuth:
 *         type: http
 *         scheme: bearer
 *         bearerFormat: JWT
 *         description: JWT token stored in an httpOnly cookie, extracted by the cookieExtractor function
 */
userRouter.get('/me', passport.authenticate('jwt', { session: false }), async (req: any, res: Response) => {
    try {
        const user = req.user;

        res.status(200).json({
            success: true,
            data: {
                userId: user.id,
                email: user.email,
                role: user.role || UserRole.USER
            },
        });
    } catch (error) {
        console.error('Error in /me endpoint:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


/**
 * @swagger
 * /api/auth/facebook/data-deletion:
 *   post:
 *     summary: Facebook Data Deletion Callback
 *     description: Endpoint that Facebook calls when a user requests deletion of their data. Deletes the user and related data from the system.
 *     tags:
 *       - Facebook
 *     requestBody:
 *       description: Data deletion request payload from Facebook
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               user_id:
 *                 type: string
 *                 description: Facebook user ID of the user to delete
 *               deletion_request_id:
 *                 type: string
 *                 description: Unique ID of the deletion request provided by Facebook
 *             required:
 *               - user_id
 *               - deletion_request_id
 *     responses:
 *       200:
 *         description: Successful deletion confirmation response to Facebook
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: URL of the confirmation page shown to the user
 *                 confirmation_code:
 *                   type: string
 *                   description: The deletion request ID from Facebook
 *                 status:
 *                   type: string
 *                   description: Status of the deletion request processing, typically "complete"
 *               example:
 *                 url: https://dajuvai-frontend-ykrq.vercel.app/deletion-confirmation
 *                 confirmation_code: 1234567890
 *                 status: complete
 *       400:
 *         description: Missing required fields in request body
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
 *                   example: Missing user_id or deletion_request_id
 *       404:
 *         description: User not found for given Facebook ID
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
 *                   example: User not found
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
 *                 msg:
 *                   type: string
 *                   example: Internal server error
 */
userRouter.post("/facebook/data-deletion", async (req: Request, res: Response) => {
    try {
        const { user_id } = req.body;
        const deleteUser = await deleteUserDataByFacebookId(user_id)
        res.status(200).json({
            success: true,
            msg: "User deleted succesfully",
            data: deleteUser
        })
    } catch (error) {
        if (error instanceof APIError) {
            res.status(error.status).json({
                success: false,
                msg: error.message
            })
        } else {
            res.status(500).json({
                success: false,
                msg: "Internal server error"
            })
        }
    }
})



/**
 * @swagger
 * /api/auth/facebook:
 *   get:
 *     summary: Facebook OAuth login
 *     description: Initiates the Facebook OAuth authentication flow
 *     tags: [Authentication]
 *     responses:
 *       302:
 *         description: Redirects to Facebook authentication page
 */
userRouter.get('/facebook', passport.authenticate('facebook', { scope: ['email', 'public_profile'] }));

/**
 * @swagger
 * /api/auth/facebook/callback:
 *   get:
 *     summary: Facebook OAuth callback
 *     description: Callback endpoint for Facebook OAuth authentication
 *     tags: [Authentication]
 *     parameters:
 *       - in: query
 *         name: code
 *         required: true
 *         schema:
 *           type: string
 *         description: Authorization code from Facebook
 *     responses:
 *       302:
 *         description: Redirects to frontend with JWT token
 */
userRouter.get('/facebook/callback', passport.authenticate('facebook', { session: false, failureRedirect: "/api/auth/login?error=facebook_auth_failed" }), (req: any, res: Response) => {
    const { user, token } = req.user;
    res.cookie('token', token, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        maxAge: 2 * 60 * 60 * 1000,
        sameSite: 'none'
    });
    res.redirect(`${frontendUrl}/google-auth-callback`);
});


/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request password reset
 *     description: Sends a password reset token to the user's email
 *     tags: [Authentication]
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
 *                 description: Email address to send password reset token to
 *           example:
 *             email: "admin@gmail.com"
 *     responses:
 *       200:
 *         description: Password reset email sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset email sent successfully
 *             example:
 *               message: "Password reset email sent successfully"
 *       400:
 *         description: Invalid email
 *       404:
 *         description: User not found
 *       429:
 *         description: Too many requests, please try again later
 */
userRouter.post('/forgot-password', authRateLimiter, validateZod(verificationTokenSchema), userController.forgotPassword.bind(userController));

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Reset password with token
 *     description: Resets the user's password using a valid reset token
 *     tags: [Authentication]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newPass
 *               - confirmPass
 *               - token
 *             properties:
 *               newPass:
 *                 type: string
 *                 format: password
 *                 description: New password (min 8 characters)
 *               confirmPass:
 *                 type: string
 *                 format: password
 *                 description: Confirm new password
 *               token:
 *                 type: string
 *                 description: Password reset token
 *           example:
 *             newPass: "newPassword123!@#"
 *             confirmPass: "newPassword123!@#"
 *             token: "123456"
 *     responses:
 *       200:
 *         description: Password reset successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Password reset successful
 *             example:
 *               message: "Password reset successful"
 *       400:
 *         description: Invalid token, password, or passwords do not match
 *       404:
 *         description: Token not found
 *       410:
 *         description: Token expired
 *       429:
 *         description: Too many requests, please try again later
 */
userRouter.post('/reset-password', authRateLimiter, validateZod(resetPasswordSchema), userController.resetPassword.bind(userController));

userRouter.put("/admin/vendors/:vendorId/change-vendor-password", authMiddleware, isAdmin, validateZod(adminResetPasswordSchema, "body"), userController.adminChangeVendorPassword.bind(userController))

/**
 * @swagger
 * /api/auth/users/{id}:
 *   get:
 *     summary: Get user by ID
 *     description: Retrieves user information by ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *         description: User ID
 *     responses:
 *       200:
 *         description: User information
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: number
 *                   description: User ID
 *                 username:
 *                   type: string
 *                   description: Username
 *                 email:
 *                   type: string
 *                   description: User email
 *                 role:
 *                   type: string
 *                   enum: [admin, user, customer]
 *                   description: User role
 *                 isVerified:
 *                   type: boolean
 *                   description: Email verification status
 *                 products:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: number
 *                       title:
 *                         type: string
 *                   description: User's products (if vendor)
 *             example:
 *               id: 1
 *               username: "johndoe"
 *               email: "admin@gmail.com"
 *               role: "user"
 *               isVerified: true
 *               products: []
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       403:
 *         description: Forbidden - Not authorized to access this user
 *       404:
 *         description: User not found
 */
userRouter.get('/users/:id', userController.getUserById.bind(userController));

/**
 * @swagger
 * /api/auth/users/{id}:
 *   put:
 *     summary: Update user information
 *     description: Updates user profile information
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: number
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username
 *               email:
 *                 type: string
 *                 format: email
 *                 description: User email
 *               role:
 *                 type: string
 *                 enum: [admin, user, customer]
 *                 description: User role
 *           example:
 *             username: "johndoe_updated"
 *             role: "customer"
 *     responses:
 *       200:
 *         description: User updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: User updated successfully
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     username:
 *                       type: string
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [admin, user, customer]
 *             example:
 *               message: "User updated successfully"
 *               user:
 *                 id: 1
 *                 username: "johndoe_updated"
 *                 email: "admin@gmail.com"
 *                 role: "customer"
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       403:
 *         description: Forbidden - Not authorized to update this user
 *       404:
 *         description: User not found
 */
userRouter.put('/users/:id', authMiddleware, isAccountOwner, userController.updateUser.bind(userController));

/**
 * @swagger
 * /api/auth/change-email:
 *   patch:
 *     summary: Request email change
 *     description: Initiates the process to change a user's email address
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newEmail
 *             properties:
 *               newEmail:
 *                 type: string
 *                 format: email
 *                 description: New email address
 *           example:
 *             newEmail: "john.new@example.com"
 *     responses:
 *       200:
 *         description: Email change verification sent
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Verification email sent to new email address
 *             example:
 *               message: "Verification email sent to new email address"
 *       400:
 *         description: Invalid email or email already in use
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       409:
 *         description: Email already in use
 */
userRouter.patch('/change-email', authMiddleware, validateZod(changeEmailSchema), userController.updateEmail.bind(userController));

/**
 * @swagger
 * /api/auth/verify-email:
 *   post:
 *     summary: Verify email change
 *     description: Verifies and completes the email change process
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - emailChangeToken
 *             properties:
 *               token:
 *                 type: string
 *                 description: Authentication token
 *               emailChangeToken:
 *                 type: string
 *                 description: Email change verification token
 *           example:
 *             token: "auth_token_123"
 *             emailChangeToken: "email_change_token_456"
 *     responses:
 *       200:
 *         description: Email updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Email updated successfully
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: number
 *                     email:
 *                       type: string
 *                       description: New email address
 *             example:
 *               message: "Email updated successfully"
 *               user:
 *                 id: 1
 *                 email: "john.new@example.com"
 *       400:
 *         description: Invalid token
 *       401:
 *         description: Unauthorized - Invalid or missing token
 *       404:
 *         description: Token not found
 *       410:
 *         description: Token expired
 */
userRouter.post('/verify-email', authMiddleware, validateZod(verifyEmailChangeSchema), userController.verifyEmailChange.bind(userController));


userRouter.delete("/:id", userController.deleteUserHandler);
// isAdminOrStaff,

/**
 * @swagger
 * /api/auth/user/check-email:
 *   get:
 *     summary: Check if an email is already registered
 *     description: Returns whether the given email exists as a user or vendor. Used during registration to prevent duplicate accounts.
 *     tags:
 *       - User
 *     security: []
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         description: The email address to check
 *         example: john@example.com
 *     responses:
 *       200:
 *         description: Email check result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 exists:
 *                   type: boolean
 *                   description: True if the email is already registered, false otherwise
 *                   example: false
 *       400:
 *         description: Email query parameter is missing or invalid
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
 *                   example: Invalid Email
 *       503:
 *         description: Email verification service temporarily unavailable
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
 *                   example: Email verification service temporarily unavailable
 */
userRouter.get("/user/check-email", userController.checkEmailExists.bind(userController))
export default userRouter;
