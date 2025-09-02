import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fetchAllUser, createUser, findUserByEmail, findUserByEmailLogin, findUserByResetToken, getUserByIdService, updateUserService, saveUser, findVendorByEmail, saveVendor, findVendorByResetToken, getAllStaff, deleteStaffById, findUserById, updateStaffById } from '../service/user.service';
import { ISignupRequest, ILoginRequest, IVerificationTokenRequest, IVerifyTokenRequest, IResetPasswordRequest, IChangeEmailRequest, IVerifyEmailChangeRequest, IUpdateUserRequest } from '../interface/user.interface';
import { signupSchema, loginSchema, verificationTokenSchema, verifyTokenSchema, resetPasswordSchema, changeEmailSchema, verifyEmailChangeSchema, updateUserSchema } from '../utils/zod_validations/user.zod';
import { APIError } from '../utils/ApiError.utils';
import { AuthProvider, User, UserRole } from '../entities/user.entity';
import { AuthRequest, CombinedAuthRequest, isVendor } from '../middlewares/auth.middleware';
import { sendVerificationEmail } from '../utils/nodemailer.utils';
import AppDataSource from '../config/db.config';
import { VendorService } from '../service/vendor.service';

/**
 * @class TokenUtils
 * @description Utility class for generating and hashing verification tokens.
 * Provides static methods for secure token generation and hashing using bcrypt.
 */
class TokenUtils {
    /**
     * @method generateToken
     * @description Generates a random 6-digit numeric verification token.
     * @returns {string} A randomly generated 6-digit token as a string.
     */
    static generateToken(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }


    /**
     * @method hashToken
     * @description Hashes a verification token securely using bcrypt.
     * @param {string} token - The plain token string to be hashed.
     * @returns {Promise<string>} A promise that resolves to the hashed token string.
     */
    static async hashToken(token: string): Promise<string> {
        return await bcrypt.hash(token, 10);
    }
}

/**
 * @class UserController
 * @description Handles user-related operations such as admin signup and login.
 * Responsible for authentication, JWT token issuance, and cookie management.
 */
export class UserController {
    private readonly jwtSecret: string;
    private vendorService: VendorService;

    /**
      * @constructor
      * @description Initializes the UserController with a JWT secret key from environment variables.
      */
    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret';
        this.vendorService = new VendorService();
    }

    /**
     * @method adminSignup
     * @route POST /auth/admin/signup
     * @description Registers a new admin user with immediate verification and JWT issuance.
     * @param {AuthRequest<{}, {}, ISignupRequest>} req - HTTP request with signup data and authentication context.
     * @param {Response} res - HTTP response object used to return status, token, and user data.
     * @returns {Promise<void>} Responds with the created user object and authentication token in a cookie.
     * @access Public (Admin Signup)
     */
    async adminSignup(req: AuthRequest<{}, {}, ISignupRequest>, res: Response): Promise<void> {
        try {
            //  Validate request body using Zod schema
            const parsed = signupSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            //  Extract validated fields
            const { username, email, password } = parsed.data;

            //  Prepare hashed password and verification token
            const hashedPassword = await bcrypt.hash(password, 10);
            const verificationToken = TokenUtils.generateToken(); // raw token for email
            const hashedToken = await TokenUtils.hashToken(verificationToken); // hashed version for DB

            // Check if user already exists by email
            const existingUser = await findUserByEmail(email);
            if (existingUser) {
                throw new APIError(409, 'User with this email already exists');
            }

            // Create user with verified status and ADMIN role
            const user = await createUser({
                username,
                email,
                password: hashedPassword,
                verificationCode: null,
                isVerified: true,
                verificationCodeExpire: null,
                role: UserRole.ADMIN,
            });

            //  Generate JWT and set cookie
            const token = jwt.sign(
                { id: user.id, email: user.email, username: user.username, role: user.role },
                this.jwtSecret,
                { expiresIn: '2h' }
            );

            // Set httpOnly cookie with token
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 2 * 60 * 60 * 1000,
            });

            // Send successful response with user data and token
            res.status(201).json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                },
                token,
            });

        } catch (error) {
            // Handle API errors and unexpected errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                console.error('Signup Error:', error);
                res.status(503).json({ success: false, message: 'Registration service temporarily unavailable' });
            }
        }
    }

    /**
     * @method adminLogin
     * @route POST /auth/admin/login
     * @description Authenticates an admin user by validating credentials and issuing a JWT token.
     * @param {Request} req - HTTP request containing email and password for authentication.
     * @param {Response} res - HTTP response object used to return authentication result and token.
     * @returns {Promise<void>} Responds with user details and a JWT token in a cookie.
     * @access Public (Admin Login)
     */
    async adminLogin(req: Request, res: Response): Promise<void> {
        try {
            // Extract login credentials
            const { email, password } = req.body;

            // Get user repository and find user by email
            const userRepo = AppDataSource.getRepository(User);
            const user = await userRepo.findOneBy({ email });

            // Return 404 if user not found
            if (!user) {
                res.status(404).json({ success: false, message: 'User not found' });
                return;
            }

            // Check user role is ADMIN, else forbid access
            if (user.role != UserRole.ADMIN) {
                res.status(403).json({ success: false, message: 'Access denied: not an admin' });
                return;
            }

            // Compare passwords
            const isPasswordValid = await bcrypt.compare(password, user.password || '');

            if (!isPasswordValid) {
                res.status(401).json({ success: false, message: 'Invalid credentials' });
                return;
            }

            // Sign JWT token for 7 days
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                process.env.JWT_SECRET || 'your_jwt_secret',
                { expiresIn: '7d' }
            );

            // Set token cookie
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
            });

            // Send success response with user data and token
            res.status(200).json({
                success: true,
                message: 'Admin logged in successfully',
                token,
                data: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role, token
                }
            });
        } catch (error) {
            // Handle API and internal errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }


    async getAllStaff(req: Request, res: Response) {
        try {
            const staff = await getAllStaff();

            res.status(200).json({
                success: true,
                data: staff
            })
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }


    async deleteStaff(req: Request<{ id: string }, {}, {}, {}>, res: Response) {
        try {
            const id = req.params.id;

            const staffExists = await findUserById(Number(id))

            if (!staffExists) {
                throw new APIError(404, "Staff doesnot exists")
            }

            const deletedStaff = await deleteStaffById(Number(id))

            res.status(200).json({
                success: true,
                msg: "Staff deleted succesfully"
            })

        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }


    async updateStaff(req: Request<{ id: string }, {}, { data: any }, {}>, res: Response) {
        try {
            const id = req.params.id;
            const data = req.body.data;

            const staffExists = await findUserById(Number(id))

            if (!staffExists) {
                throw new APIError(404, "Staff doesnot exists")
            }

            const deletedStaff = await updateStaffById(Number(id), data)

            res.status(200).json({
                success: true,
                msg: "Staff deleted succesfully"
            })

        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }



    async staffSignup(req: AuthRequest, res: Response): Promise<void> {
        try {
            //  Validate request body using Zod schema
            const parsed = signupSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            //  Extract validated fields
            const { username, email, password } = parsed.data;

            //  Prepare hashed password and verification token
            const hashedPassword = await bcrypt.hash(password, 10);

            const loweredCaseEmail = this.toLowerEmail(email)

            // Check if user already exists by email
            const existingUser = await findUserByEmail(loweredCaseEmail);
            if (existingUser) {
                throw new APIError(409, 'User with this email already exists');
            }

            // Create user with verified status and ADMIN role
            const user = await createUser({
                username,
                email: loweredCaseEmail,
                password: hashedPassword,
                verificationCode: null,
                isVerified: true,
                verificationCodeExpire: null,
                role: UserRole.STAFF,
            });

            //  Generate JWT and set cookie
            const token = jwt.sign(
                { id: user.id, email: user.email, username: user.username, role: user.role },
                this.jwtSecret,
                { expiresIn: '24h' }
            );

            // Set httpOnly cookie with token
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000,
            });

            // Send successful response with user data and token
            res.status(201).json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                },
                token,
            });

        } catch (error) {
            // Handle API errors and unexpected errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                console.error('Signup Error:', error);
                res.status(503).json({ success: false, message: 'Registration service temporarily unavailable' });
            }
        }
    }

    /**
     * @method getUsers
     * @route GET /users
     * @description Fetches all users from the database.
     * @param {Request} req - Express request object
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Resolves with a list of users or error response
     * @access Admin
     */
    async getUsers(req: Request, res: Response): Promise<void> {
        try {
            // Fetch all users
            const users = await fetchAllUser();
            res.status(200).json({ success: true, data: users });
        } catch (error) {
            // Handle API errors and internal server errors
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }

    /**
     * @method signup
     * @route POST /auth/signup
     * @description Registers a new user, handles existing unverified users,
     * sends a verification email, hashes password and stores user info.
     * Issues JWT token on successful registration.
     * 
     * @param {AuthRequest<{}, {}, ISignupRequest>} req - Express request with validated signup data
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Resolves with user object and JWT or throws error
     * @access Public
     */
    async signup(req: AuthRequest<{}, {}, ISignupRequest>, res: Response): Promise<void> {
        try {
            //  Validate request body using Zod schema
            const parsed = signupSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            //  Extract validated fields
            const { username, email, password } = parsed.data;


            const loweredEmail = this.toLowerEmail(email)

            // Check if a user with this email already exists
            let existingUser = await findUserByEmail(loweredEmail);

            const existingAccount = await this.vendorService.findVendorByEmail(loweredEmail)

            if (existingAccount) {
                throw new APIError(400, "User already exists")
            }

            //  Prepare hashed password and verification token
            const hashedPassword = await bcrypt.hash(password, 10);
            const verificationToken = TokenUtils.generateToken(); // raw token for email
            const hashedToken = await TokenUtils.hashToken(verificationToken); // hashed version for DB
            const expire = new Date(Date.now() + 15 * 60 * 1000); // token expires in 15 minutes

            if (existingUser) {
                if (existingUser.isVerified) {
                    // User already verified — reject signup
                    throw new APIError(409, 'User already exists and is verified');
                }

                // User exists but is not verified — update info and resend verification email
                existingUser.username = username;
                existingUser.password = hashedPassword;
                existingUser.verificationCode = hashedToken;
                existingUser.verificationCodeExpire = expire;

                // Save updated user and send verification email
                await saveUser(existingUser);
                // await sendVerificationEmail(email, 'Email Verification', verificationToken);

                res.status(200).json({
                    success: true,
                    message: 'Verification code resent. Please check your email.',
                });
                return;
            }

            // Create and save new user (first-time signup)
            const user = await createUser({
                username,
                email: loweredEmail,
                password: hashedPassword,
                verificationCode: hashedToken,
                verificationCodeExpire: expire,
                role: UserRole.USER,
                isVerified: true
            });

            //  Send email with raw verification code
            // await sendVerificationEmail(email, 'Email Verification', verificationToken);

            //  Generate JWT and set cookie
            const token = jwt.sign(
                { id: user.id, email: user.email, username: user.username, role: user.role },
                this.jwtSecret,
                { expiresIn: '2h' }
            );

            // Set secure cookie with token
            res.cookie('token', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 2 * 60 * 60 * 1000, // 2 hours
            });

            //  Return user and token (without password or verificationCode)
            res.status(201).json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email,
                    role: user.role,
                },
                token,
            });

        } catch (error) {
            console.log(error);
            //  Error handling with meaningful status
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                console.error('Signup Error:', error);
                throw new APIError(503, 'Registration service temporarily unavailable');
            }
        }
    }


    /**
     * @method login
     * @route POST /auth/login
     * @description Authenticates a user or vendor, verifies credentials,
     * handles unverified users, issues JWT token and sets it in a secure cookie.
     * 
     * @param {Request<{}, {}, ILoginRequest>} req - Express request with login credentials
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Responds with user or vendor data and token
     * @access Public
     * @throws {APIError} If validation fails or credentials are incorrect
     */
    async login(req: Request<{}, {}, ILoginRequest>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema
            const parsed = loginSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Verify user existence and password
            const { email, password } = parsed.data;

            const loweredEmail = this.toLowerEmail(email);

            const user = await findUserByEmailLogin(loweredEmail);

            if (!user) {
                throw new APIError(404, "User does not exist");
            }

            console.log(user.provider)

            if (user.provider !== AuthProvider.LOCAL) {
                throw new APIError(403, "This account was created with Google. Please log in using Google.");
            }


            if (!user.isVerified) {
                throw new APIError(403, "Please verify your email before logging in");
            }

            // Compare password
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                throw new APIError(401, "Invalid credentials");
            }

            // Generate JWT
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                this.jwtSecret,
                { expiresIn: "2h" }
            );

            // Set cookie
            res.cookie("token", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 2 * 60 * 60 * 1000,
            });

            // Response
            res.status(200).json({
                success: true,
                token,
                data: { userId: user.id, email: user.email, role: user.role },
            });

        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                console.error("Unexpected error during login:", error);
                res.status(503).json({ success: false, message: "Authentication service temporarily unavailable" });
            }
        }
    }

    toLowerEmail(email: string): string {
        return email.toLowerCase()
    }


    /**
     * @method sendVerificationToken
     * @route POST /auth/resend-verification
     * @description Sends a new email verification token to a user or vendor.
     * Implements rate limiting to avoid abuse, hashes token before storing,
     * and sends email with raw token.
     * 
     * @param {Request<{}, {}, IVerificationTokenRequest>} req - Express request with email in body
     * @param {Response} res - Express response object
     * @returns {Promise<void>} Sends token or error response
     * @access Public
     * @throws {APIError} On validation failure, rate limit breach, or user/vendor not found
     */
    async sendVerificationToken(req: Request<{}, {}, IVerificationTokenRequest>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema to ensure correct structure and types
            const parsed = verificationTokenSchema.safeParse(req.body);
            if (!parsed.success) {
                // Return 400 Bad Request if validation fails, including detailed errors
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Extract email from validated data
            const { email } = parsed.data;

            const loweredEmail = this.toLowerEmail(email)

            // Attempt to find user by email
            let user = await findUserByEmail(loweredEmail);
            let vendor = null;
            let isVendor = false;

            // If no user found, attempt to find vendor by email
            if (!user) {
                vendor = await findVendorByEmail(loweredEmail);
                isVendor = true;
                if (!vendor) {
                    // If neither user nor vendor exists, respond with 404 Not Found
                    throw new APIError(404, 'User or vendor not found');
                }
            }

            // Reference the correct entity (user or vendor) for further processing
            const entity = isVendor ? vendor : user;
            const now = new Date();

            // Check if the entity is currently blocked from resending verification tokens
            if (entity.resendBlockUntil && entity.resendBlockUntil > now) {
                // Calculate remaining block time in minutes
                const remainingSeconds = Math.ceil((entity.resendBlockUntil.getTime() - now.getTime()) / 1000);
                const remainingMinutes = Math.ceil(remainingSeconds / 60);
                // Respond with 429 Too Many Requests and inform about the cooldown period
                throw new APIError(429, `Too many verification attempts. Please try again in ${remainingMinutes} minute(s).`);
            }

            // Reset resend count and block if the resend limit has been reached
            if (entity.resendCount >= 3) {
                entity.resendCount = 0;
                entity.resendBlockUntil = null;
            }

            // Generate a new 6-digit verification token (raw, for emailing)
            const verificationToken = TokenUtils.generateToken();
            // Hash the token securely before storing it in the database
            const hashedToken = await TokenUtils.hashToken(verificationToken);
            // Set token expiration time to 15 minutes from now
            const expire = new Date(Date.now() + 15 * 60 * 1000);

            // Update entity with new hashed token and expiration
            entity.verificationCode = hashedToken;
            entity.verificationCodeExpire = expire;
            // Increment resend attempt counter
            entity.resendCount += 1;

            // If resend attempts hit limit, set block duration of 10 minutes
            if (entity.resendCount >= 3) {
                entity.resendBlockUntil = new Date(Date.now() + 10 * 60 * 1000);
            }

            // Save updated user or vendor entity back to the database
            await (isVendor ? saveVendor(vendor) : saveUser(user));

            // Send verification email containing the raw token to the user's or vendor's email address
            await sendVerificationEmail(entity.email, 'Email Verification', verificationToken);

            // Respond with HTTP 202 Accepted to indicate the token has been sent
            res.status(202).json({
                success: true,
                message: 'Verification token sent',
            });
        } catch (error) {
            // Handle known APIError with appropriate status and message
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // For unexpected errors, throw a generic 503 Service Unavailable error
                throw new APIError(503, 'Verification service temporarily unavailable');
            }
        }
    }


    /**
     * @method verifyToken
     * @route POST /auth/verify
     * @description Verifies the email verification token provided by the user or vendor.
     * Validates token presence, expiry, and correctness. Updates verification status upon success.
     *
     * @param {Request<{}, {}, IVerifyTokenRequest>} req - Express request containing email and token.
     * @param {Response} res - Express response object for sending the verification result.
     * @returns {Promise<void>} Sends success or error response based on token verification.
     * @throws {APIError} For validation issues, expired/invalid tokens, or missing entities.
     * @access Public
     */
    async verifyToken(req: Request<{}, {}, IVerifyTokenRequest>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema to ensure email and token are correctly provided
            const parsed = verifyTokenSchema.safeParse(req.body);
            if (!parsed.success) {
                // Return 400 Bad Request if validation fails, including detailed errors
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Extract email and token from validated data
            const { email, token } = parsed.data;

            // Attempt to find user by email
            let user = await findUserByEmail(email);
            let vendor = null;
            let isVendor = false;

            // If no user found, attempt to find vendor by email
            if (!user) {
                vendor = await findVendorByEmail(email);
                isVendor = true;
                if (!vendor) {
                    // If neither user nor vendor exists, token is no longer valid
                    throw new APIError(410, 'Token no longer valid');
                }
            }

            // Reference the correct entity (user or vendor) for further validation
            const entity = isVendor ? vendor : user;

            // Check if verification token and its expiration exist for the entity
            if (!entity.verificationCode || !entity.verificationCodeExpire) {
                throw new APIError(410, 'Token no longer valid');
            }

            // Check if the token has expired
            if (entity.verificationCodeExpire < new Date()) {
                throw new APIError(410, 'Token expired');
            }

            // Compare provided token with the hashed token stored in the database
            const isMatch = await bcrypt.compare(token, entity.verificationCode);
            if (!isMatch) {
                // If token does not match, respond with 400 Bad Request
                throw new APIError(400, 'Invalid token');
            }

            // Token is valid: reset verification-related fields and mark entity as verified
            entity.verificationCode = null;
            entity.verificationCodeExpire = null;
            entity.resendCount = 0;
            entity.resendBlockUntil = null;
            entity.isVerified = true;

            // Save the updated user or vendor entity to the database
            await (isVendor ? saveVendor(vendor) : saveUser(user));

            // Respond with 200 OK and success message
            res.status(200).json({
                success: true,
                message: 'Email verified successfully',
            });
        } catch (error) {
            // Handle known APIError with appropriate status and message
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // For unexpected errors, throw a generic 503 Service Unavailable error
                throw new APIError(503, 'Verification service temporarily unavailable');
            }
        }
    }


    /**
     * @method forgotPassword
     * @route POST /auth/forgot-password
     * @description Handles a password reset request by generating and emailing a reset token.
     * Sends a token with 15-minute expiry to the user's or vendor's email if found.
     *
     * @param {Request<{}, {}, IVerificationTokenRequest>} req - Express request with email field.
     * @param {Response} res - Express response object for sending HTTP responses.
     * @returns {Promise<void>} Sends success message on token generation or appropriate error.
     * @throws {APIError} On validation failure, user/vendor not found, or internal issues.
     * @access Public
     */
    async forgotPassword(req: Request<{}, {}, IVerificationTokenRequest>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema to ensure email is provided and correctly formatted
            const parsed = verificationTokenSchema.safeParse(req.body);
            if (!parsed.success) {
                // Respond with 400 Bad Request if validation fails, including detailed error information
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Extract email from validated data
            const { email } = parsed.data;

            // Attempt to find a user with the provided email
            let user = await findUserByEmail(email);

            if (user.provider === AuthProvider.GOOGLE) {
                throw new APIError(400, "Google login users cannot change password.");
            }

            let vendor = null;
            let isVendor = false;

            // If user is not found, attempt to find a vendor with the email
            if (!user) {
                vendor = await findVendorByEmail(email);
                isVendor = true;
                if (!vendor) {
                    // If neither user nor vendor exists, respond with 404 Not Found
                    throw new APIError(404, 'User or vendor not found');
                }
            }

            // Select the correct entity (user or vendor) to update
            const entity = isVendor ? vendor : user;

            // Generate a new password reset token and set its expiration time (15 minutes from now)
            const token = TokenUtils.generateToken();
            const tokenExpire = new Date(Date.now() + 15 * 60 * 1000);

            // Store the reset token and expiration time in the entity
            entity.resetToken = token;
            entity.resetTokenExpire = tokenExpire;

            // Save the updated entity to the database
            await (isVendor ? saveVendor(vendor) : saveUser(user));

            // Send an email to the user or vendor with the reset token and instructions
            await sendVerificationEmail(entity.email, 'Reset Password', token);

            // Respond with 202 Accepted indicating the reset email has been sent successfully
            res.status(202).json({
                success: true,
                message: 'Password reset request sent',
            });
        } catch (error) {
            // Handle expected API errors with their respective status and message
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // For unexpected errors, throw a generic 503 Service Unavailable error
                throw new APIError(503, 'Password reset service temporarily unavailable');
            }
        }
    }


    /**
     * @method resetPassword
     * @route POST /auth/reset-password
     * @description Resets the user's or vendor's password using a valid reset token.
     * Verifies the token, hashes the new password, updates the entity, and clears the token.
     *
     * @param {Request<{}, {}, IResetPasswordRequest>} req - Express request containing reset token and new password.
     * @param {Response} res - Express response object to return result.
     * @returns {Promise<void>} Sends success message upon successful password reset.
     * @throws {APIError} For invalid or expired token, user/vendor not found, or unexpected errors.
     * @access Public
     */
    async resetPassword(req: Request<{}, {}, IResetPasswordRequest>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema to ensure newPass and token are provided and valid
            const parsed = resetPasswordSchema.safeParse(req.body);
            if (!parsed.success) {
                // Respond with 400 Bad Request if validation fails, including error details
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Extract new password and reset token from validated data
            const { newPass, token } = parsed.data;

            // Attempt to find a user associated with the reset token
            let user = await findUserByResetToken(token);
            let vendor = null;
            let isVendor = false;

            // If no user found, try to find a vendor associated with the reset token
            if (!user) {
                vendor = await findVendorByResetToken(token);
                isVendor = true;
                if (!vendor) {
                    // If neither user nor vendor found, respond with 410 Gone (token no longer valid)
                    throw new APIError(410, 'Reset token no longer valid');
                }
            }

            // Select the correct entity (user or vendor) to update
            const entity = isVendor ? vendor : user;

            // Hash the new password securely using bcrypt with salt rounds = 10
            const hashedPassword = await bcrypt.hash(newPass, 10);

            // Update the entity's password with the hashed password
            entity.password = hashedPassword;

            // Clear reset token and expiration to prevent reuse
            entity.resetToken = null;
            entity.resetTokenExpire = null;

            // Save the updated entity to the database
            await (isVendor ? saveVendor(vendor) : saveUser(user));

            // Respond with 200 OK indicating password reset was successful
            res.status(200).json({
                success: true,
                message: 'Password reset successfully',
            });
        } catch (error) {
            // Handle known API errors with their specific status and message
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Handle unexpected errors with generic 503 Service Unavailable
                throw new APIError(503, 'Password reset service temporarily unavailable');
            }
        }
    }


    /** 
     * @method getUserById
     * @route GET /users/:id
     * @description Retrieves a user by their unique ID. Returns 404 if not found.
     *
     * @param {Request<{ id: string }>} req - Express request with user ID as route parameter.
     * @param {Response} res - Express response object to return user data.
     * @returns {Promise<void>} Sends user data on success or error on failure.
     * @throws {APIError} For invalid ID, user not found, or service errors.
     * @access Admin
     */
    async getUserById(req: Request<{ id: string }>, res: Response): Promise<void> {
        try {
            // Parse and validate user ID from request parameters
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                throw new APIError(400, 'Invalid user ID');
            }

            // Retrieve user data using service layer
            const user = await getUserByIdService(id);
            if (!user) {
                throw new APIError(404, 'User not found');
            }

            // Return success response with user data
            res.status(200).json({
                success: true,
                data: user,
            });
        } catch (error) {
            // Handle known API errors with specific status codes
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                // Handle unexpected errors with generic service unavailable response
                throw new APIError(503, 'User service temporarily unavailable');
            }
        }
    }

    /**
     * @method updateUser
     * @route PUT /users/:id
     * @description Updates a user's profile information by their ID.
     * Only admin can change the user's role.
     *
     * @param {AuthRequest<{ id: string }, {}, IUpdateUserRequest>} req - Authenticated request with user ID in params and update data in body.
     * @param {Response} res - Express response object to return result or error.
     * @returns {Promise<void>} Sends updated user data or error response.
     * @throws {APIError} On validation, unauthorized role change, or user not found.
     * @access Admin, Self
     */
    async updateUser(
        req: AuthRequest<{ id: string }, {}, IUpdateUserRequest>,
        res: Response
    ): Promise<void> {
        try {
            // Validate request body using Zod schema
            const parsed = updateUserSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Validate and parse user ID from URL parameters
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                throw new APIError(400, 'Invalid user ID');
            }

            const userExists = await findUserById(id);

            if (!userExists) {
                throw new APIError(404, "USer does not existsf")
            }

            // Enforce role update restrictions: only admins can change roles
            if (parsed.data.role && req.user?.role !== UserRole.ADMIN) {
                throw new APIError(403, 'Only admins can change roles');
            }

            // Proceed to update user data with validated input
            const updateData = parsed.data;
            const user = await updateUserService(id, updateData, userExists);
            if (!user) {
                throw new APIError(404, 'User not found');
            }

            // Respond with success and updated user info summary
            res.status(200).json({
                success: true,
                message: 'User updated successfully',
                data: { id: user.id, username: user.username, email: user.email, role: user.role },
            });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                throw new APIError(503, 'User update service temporarily unavailable');
            }
        }
    }



    /**
    * @method updateEmail
    * @route POST /auth/update-email
    * @description Initiates an email change request for an authenticated user or vendor.
    * Sends a verification token to the new email and returns a signed emailChangeToken JWT.
    *
    * @param {CombinedAuthRequest<{}, {}, IChangeEmailRequest>} req - Request with new email in body and authenticated user/vendor.
    * @param {Response} res - Express response object.
    * @returns {Promise<void>} Responds with success message and emailChangeToken.
    * @throws {APIError} For validation, authentication, or duplicate email.
    * @access Authenticated
    */
    async updateEmail(
        req: CombinedAuthRequest<{}, {}, IChangeEmailRequest>,
        res: Response
    ): Promise<void> {
        try {
            console.log(req.user)
            console.log(req.body)
            // Validate request body using Zod schema
            const parsed = changeEmailSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }


            // Verify user or vendor authentication
            const { newEmail } = parsed.data;
            const user = req.user;
            const vendor = req.vendor;
            if (!user && !vendor) {
                throw new APIError(401, 'Unauthorized. Please log in.');
            }
            // Check if new email is already in use
            const existingUser = await findUserByEmail(newEmail);
            const existingVendor = await findVendorByEmail(newEmail);

            const isVendor = vendor;

            const entity = isVendor ? existingVendor : existingUser;

            if (existingUser || existingVendor) {
                throw new APIError(409, 'Email already in use.');
            }


            // Generate verification token and JWT for email change
            const verificationToken = TokenUtils.generateToken();
            const hashedToken = await TokenUtils.hashToken(verificationToken);
            const expire = new Date(Date.now() + 15 * 60 * 1000);
            const emailChangeToken = jwt.sign(
                { id: entity.id, newEmail, type: isVendor ? 'vendor' : 'user' },
                this.jwtSecret,
                { expiresIn: '15m' }
            );

            // Update user or vendor with verification token
            entity.verificationCode = hashedToken;
            entity.verificationCodeExpire = expire;
            await (isVendor ? saveVendor(vendor) : saveUser(user));

            // Send verification email to new address
            await sendVerificationEmail(newEmail, 'Verify New Email', verificationToken);

            res.status(202).json({
                success: true,
                message: 'Verification email sent to new email address.',
                emailChangeToken,
            });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                console.log(error)
                throw new APIError(503, 'Email change service temporarily unavailable');
            }
        }
    }


    /**
     * @method deleteUserHandler
     * @route DELETE /users/:id
     * @description Deletes a user from the database using their ID.
     *
     * @param {Request} req - Request containing the user ID as route parameter.
     * @param {Response} res - Response with deletion success or appropriate error.
     * @returns {Promise<void>} Sends deletion success or error.
     * @throws {APIError} For invalid ID, user not found, or internal error.
     * @access Admin
     */
    async deleteUserHandler(req: Request, res: Response): Promise<void> {
        try {
            const userId = parseInt(req.params.id);

            if (isNaN(userId)) {
                res.status(400).json({ success: false, message: "Invalid user ID" });
                return;
            }

            const userRepo = AppDataSource.getRepository(User);

            const user = await userRepo.findOneBy({ id: userId });

            if (!user) {
                res.status(404).json({ success: false, message: "User not found" });
                return;
            }

            await userRepo.remove(user);

            res.status(200).json({ success: true, message: "User deleted successfully" });

        } catch (error) {
            console.error("Delete user error:", error);
            res.status(500).json({ success: false, message: "Internal server error" });
        }
    }


    /**
     * @method verifyEmailChange
     * @route POST /auth/verify-email-change
     * @description Verifies and finalizes the email change using verification code and signed JWT.
     *
     * @param {CombinedAuthRequest<{}, {}, IVerifyEmailChangeRequest & { emailChangeToken: string }>} req - Authenticated request with verification code and JWT.
     * @param {Response} res - Express response object.
     * @returns {Promise<void>} Sends success message or error.
     * @throws {APIError} For token mismatch, expiry, conflict, or malformed JWT.
     * @access Authenticated
     */
    async verifyEmailChange(req: CombinedAuthRequest<{}, {}, IVerifyEmailChangeRequest & { emailChangeToken: string }>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema
            const parsed = verifyEmailChangeSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Verify user or vendor authentication
            const { token, emailChangeToken } = parsed.data;
            const user = req.user;
            const vendor = req.vendor;
            if (!user && !vendor) {
                throw new APIError(401, 'Unauthorized. Please log in.');
            }

            const isVendor = !!vendor;
            const entity = isVendor ? vendor : user;

            // Check for valid verification token
            if (!entity.verificationCode || !entity.verificationCodeExpire) {
                throw new APIError(410, 'No email change request found.');
            }
            if (entity.verificationCodeExpire < new Date()) {
                throw new APIError(410, 'Token expired.');
            }
            const isMatch = await bcrypt.compare(token, entity.verificationCode);
            if (!isMatch) {
                throw new APIError(400, 'Invalid token.');
            }

            // Verify email change JWT
            let decoded: { id: number; newEmail: string; type: string };
            try {
                decoded = jwt.verify(emailChangeToken, this.jwtSecret) as {
                    id: number;
                    newEmail: string;
                    type: string;
                };
            } catch (error) {
                throw new APIError(400, 'Invalid or expired email change token.');
            }

            // Ensure user ID and type match
            if (decoded.id !== entity.id || decoded.type !== (isVendor ? 'vendor' : 'user')) {
                throw new APIError(400, 'Invalid token: User or type mismatch.');
            }

            // Check if new email is already in use
            const existingUser = await findUserByEmail(decoded.newEmail);
            const existingVendor = await findVendorByEmail(decoded.newEmail);
            if (existingUser || existingVendor) {
                throw new APIError(409, 'Email already in use.');
            }

            // Update user or vendor email and clear verification data
            entity.email = decoded.newEmail;
            entity.verificationCode = null;
            entity.verificationCodeExpire = null;
            await (isVendor ? saveVendor(vendor) : saveUser(user));

            res.status(200).json({
                success: true,
                message: 'Email updated successfully.',
            });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                throw new APIError(503, 'Email verification service temporarily unavailable');
            }
        }
    }
}