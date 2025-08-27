import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { AuthRequest, VendorAuthRequest, isVendor } from '../middlewares/auth.middleware';
import { sendVerificationEmail } from '../utils/nodemailer.utils';
import { VendorService } from '../service/vendor.service';
import {
    IVendorSignupRequest,
    IVendorLoginRequest,
    IVerificationTokenRequest,
    IResetPasswordRequest,
    IUpdateVendorRequest,
} from '../interface/vendor.interface';
import {
    vendorSignupSchema,
    vendorLoginSchema,
    verificationTokenSchema,
    resetPasswordSchema,
    updateVendorSchema,
} from '../utils/zod_validations/vendor.zod';
import { APIError } from '../utils/ApiError.utils';
import { DistrictService } from '../service/district.service';
import { findUserByEmail } from '../service/user.service';

/**
 * Utility class for token management
 * Handles token generation and hashing
 */
class TokenUtils {
    /**
     * Generates a random 6-digit verification token.
     * @returns string - A 6-digit token
     */
    static generateToken(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    /**
     * Hashes a token using bcrypt.
     * @param token - The token to hash
     * @returns Promise<string> - The hashed token
     */
    static async hashToken(token: string): Promise<string> {
        return await bcrypt.hash(token, 10);
    }
}

/**
 * Controller for handling vendor-related HTTP requests.
 * Belongs to the Vendor module.
 */
export class VendorController {
    private readonly jwtSecret: string;
    private readonly vendorService: VendorService;
    private districtService: DistrictService;

    /**
     * Initializes the controller with a JWT secret and VendorService instance.
     */
    constructor() {
        this.jwtSecret = process.env.JWT_SECRET || 'your_jwt_secret';
        this.vendorService = new VendorService();
        this.districtService = new DistrictService();
    }

    /**
     * GET /vendor/all
     * Fetches all vendors from the database.
     *
     * @param {VendorAuthRequest} req - Authenticated request
     * @param {Response} res - Express response object
     * @returns {Promise<void>} - Responds with vendor list
     * @access Admin
     */
    async getVendors(req: VendorAuthRequest, res: Response): Promise<void> {
        try {
            /* Fetch all vendors */
            const vendors = await this.vendorService.fetchAllVendors();
            res.status(200).json({ success: true, data: vendors });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({ success: false, message: 'Internal server error' });
            }
        }
    }


    async getUnapprovedVendorList(req: AuthRequest, res: Response) {
        try {
            const unapprovedList = await this.vendorService.fetchAllUnapprovedVendor();

            res.status(200).json({
                success: true,
                data: unapprovedList
            })
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({
                    success: false,
                    msg: error.message
                })
            } else {
                res.status(500).json({
                    sucess: false,
                    msg: "Internal server error"
                })
            }
        }
    }

    /**
     * POST /vendor/signup
     * Registers a new vendor, sends a verification email, and issues a JWT.
     *
     * @param {VendorAuthRequest<{}, {}, IVendorSignupRequest>} req - Signup request
     * @param {Response} res - Express response object
     * @returns {Promise<void>} - Responds with vendor object and JWT
     * @access Public
     */
    async vendorSignup(req: VendorAuthRequest<{}, {}, IVendorSignupRequest>, res: Response): Promise<void> {
        try {
            /* ✅ Validate request body using Zod schema */
            const parsed = vendorSignupSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            const {
                businessName,
                email,
                password,
                phoneNumber,
                district,
                businessRegNumber,
                taxNumber,
                taxDocuments,
                citizenshipDocuments,
                chequePhoto,
                bankDetails,
            } = parsed.data;

            const verificationToken = TokenUtils.generateToken();

            /* ✅ Check for existing vendor or user */
            const existingVendor = await this.vendorService.findVendorByEmail(email);
            const existingUser = await findUserByEmail(email);

            if (existingUser) throw new APIError(409, "User already exists");
            if (existingVendor && existingVendor.isVerified) throw new APIError(409, "Vendor already exists");

            /* ✅ Check if district exists */
            const districtEntity = await this.districtService.findDistrictByName(district);
            if (!districtEntity) throw new APIError(400, "District does not exist");

            /* ✅ Hash password */
            const hashedPassword = await bcrypt.hash(password, 10);

            /* ✅ Generate verification token */
            const hashedToken = await TokenUtils.hashToken(verificationToken);
            const verificationCodeExpire = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

            /* ✅ Create vendor */
            const vendor = await this.vendorService.createVendor({
                businessName,
                email,
                password: hashedPassword,
                phoneNumber,
                district,
                businessRegNumber,
                taxNumber,
                taxDocuments, // array
                citizenshipDocuments, // optional array
                chequePhoto,
                accountName: bankDetails.accountName,
                bankName: bankDetails.bankName,
                accountNumber: bankDetails.accountNumber,
                bankBranch: bankDetails.bankBranch,
                bankCode: bankDetails.bankCode,
                verificationCode: hashedToken,
                verificationCodeExpire,
            });

            /* ✅ Send verification email */
            await sendVerificationEmail(email, "Vendor Email Verification", verificationToken);

            /* ✅ Generate JWT */
            const token = jwt.sign(
                { id: vendor.id, email: vendor.email, businessName: vendor.businessName },
                this.jwtSecret,
                { expiresIn: "2h" }
            );

            /* ✅ Set JWT cookie */
            res.cookie("vendorToken", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 2 * 60 * 60 * 1000,
            });

            /* ✅ Send success response */
            res.status(201).json({
                success: true,
                vendor,
                token,
            });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                console.error("Vendor signup error:", error);
                res.status(500).json({ success: false, msg: error.message || "Internal Server Error" });
            }
        }
    }

    /**
     * POST /vendor/login
     * Authenticates a vendor and issues a JWT.
     *
     * @param {VendorAuthRequest<{}, {}, IVendorLoginRequest>} req - Login request
     * @param {Response} res - Express response object
     * @returns {Promise<void>} - Responds with vendor object and JWT
     * @access Public
     */
    async login(req: VendorAuthRequest<{}, {}, IVendorLoginRequest>, res: Response): Promise<void> {
        try {
            /* Validate request body */
            const parsed = vendorLoginSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            /* Verify vendor credentials */
            const { email, password } = parsed.data;
            const vendor = await this.vendorService.findVendorByEmailLogin(email);
            if (!vendor) {
                throw new APIError(401, 'Vendor does not exist');
            }

            if (!vendor.isApproved) {
                throw new APIError(403, "Your account is not yet approved. You can only login once an admin approves you as a vendor.");
            }

            const isMatch = await bcrypt.compare(password, vendor.password);
            if (!isMatch) {
                throw new APIError(401, 'Invalid credentials');
            }

            /* Generate JWT and set cookie */
            const token = jwt.sign(
                { id: vendor.id, email: vendor.email, businessName: vendor.businessName },
                this.jwtSecret,
                { expiresIn: '2h' }
            );
            res.cookie('vendorToken', token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 2 * 60 * 60 * 1000,
            });

            /* Send success response */
            res.status(200).json({
                success: true,
                vendor: { id: vendor.id, email: vendor.email, businessName: vendor.businessName },
                token,
            });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                throw new APIError(503, 'Authentication service temporarily unavailable');
            }
        }
    }

    /**
     * POST /vendor/resend-token
     * Sends a new verification token to the vendor's email.
     *
     * @param {VendorAuthRequest<{}, {}, IVerificationTokenRequest>} req - Resend token request
     * @param {Response} res - Express response object
     * @returns {Promise<void>} - Responds with a success message
     * @access Public
     */
    async sendVerificationToken(req: VendorAuthRequest<{}, {}, IVerificationTokenRequest>, res: Response): Promise<void> {
        try {
            /* Validate request body */
            const parsed = verificationTokenSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            /* Check vendor existence and resend limits */
            const { email } = parsed.data;
            const vendor = await this.vendorService.findVendorByEmail(email);
            if (!vendor) {
                throw new APIError(404, 'Vendor not found');
            }
            const now = new Date();
            if (vendor.resendBlockUntil && vendor.resendBlockUntil > now) {
                const remainingSeconds = Math.ceil((vendor.resendBlockUntil.getTime() - now.getTime()) / 1000);
                const remainingMinutes = Math.ceil(remainingSeconds / 60);
                throw new APIError(429, `Too many verification attempts. Please try again in ${remainingMinutes} minute(s).`);
            }

            /* Reset resend count if needed */
            if (vendor.resendCount >= 3) {
                vendor.resendCount = 0;
                vendor.resendBlockUntil = null;
            }

            /* Generate and store new token */
            const verificationToken = TokenUtils.generateToken();
            const hashedToken = await TokenUtils.hashToken(verificationToken);
            const expire = new Date(Date.now() + 15 * 60 * 1000);

            vendor.verificationCode = hashedToken;
            vendor.verificationCodeExpire = expire;
            vendor.resendCount += 1;
            if (vendor.resendCount >= 3) {
                vendor.resendBlockUntil = new Date(Date.now() + 10 * 60 * 1000);
            }

            await this.vendorService.saveVendor(vendor);

            /* Send verification email */
            await sendVerificationEmail(vendor.email, 'Vendor Email Verification', verificationToken);

            /* Send success response */
            res.status(202).json({
                success: true,
                message: 'Verification token sent',
            });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                throw new APIError(503, 'Verification service temporarily unavailable');
            }
        }
    }

    /**
     * POST /api/vendor/forgot-password
     * Sends a password reset token to the vendor's registered email.
     *
     * @param req {VendorAuthRequest<{}, {}, IVerificationTokenRequest>} - Request body with vendor email
     * @param res {Response} - Express response object
     * @returns {Promise<void>} - 202 Accepted if email is sent, or appropriate error
     * @access Public
     */

    async forgotPassword(req: VendorAuthRequest<{}, {}, IVerificationTokenRequest>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema
            const parsed = verificationTokenSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Verify vendor existence
            const { email } = parsed.data;
            const vendor = await this.vendorService.findVendorByEmail(email);
            if (!vendor) {
                throw new APIError(404, 'Vendor not found');
            }

            // Generate and store reset token
            const token = TokenUtils.generateToken();
            const tokenExpire = new Date(Date.now() + 15 * 60 * 1000);
            vendor.resetToken = token;
            vendor.resetTokenExpire = tokenExpire;
            await this.vendorService.saveVendor(vendor);

            // Send reset email
            await sendVerificationEmail(vendor.email, 'Reset Password', token);

            res.status(202).json({
                success: true,
                message: 'Password reset request sent',
            });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                throw new APIError(503, 'Password reset service temporarily unavailable');
            }
        }
    }


    /**
     * POST /api/vendor/reset-password
     * Resets a vendor's password using a valid reset token and a new password.
     *
     * @param req {VendorAuthRequest<{}, {}, IResetPasswordRequest>} - Request with token and new password
     * @param res {Response} - Express response object
     * @returns {Promise<void>} - 200 OK on successful reset, or appropriate error
     * @access Public
     */

    async resetPassword(req: VendorAuthRequest<{}, {}, IResetPasswordRequest>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema
            const parsed = resetPasswordSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Verify vendor by reset token
            const { newPass, token } = parsed.data;
            const vendor = await this.vendorService.findVendorByResetToken(token);
            if (!vendor) {
                throw new APIError(410, 'Reset token no longer valid');
            }

            // Hash and update password
            const hashedPassword = await bcrypt.hash(newPass, 10);
            vendor.password = hashedPassword;
            vendor.resetToken = null;
            vendor.resetTokenExpire = null;
            await this.vendorService.saveVendor(vendor);

            res.status(200).json({
                success: true,
                message: 'Password reset successfully',
            });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                throw new APIError(503, 'Password reset service temporarily unavailable');
            }
        }
    }

    /**
     * GET /api/vendor/:id
     * Fetches a vendor's profile by ID.
     *
     * @param req {VendorAuthRequest<{ id: string }>} - Request params containing vendor ID
     * @param res {Response} - Express response object
     * @returns {Promise<void>} - 200 OK with vendor data or appropriate error
     * @access Admin | Authenticated Vendor (depending on implementation)
     */

    async getVendorById(req: VendorAuthRequest<{ id: string }>, res: Response): Promise<void> {
        try {
            // Validate vendor ID
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                throw new APIError(400, 'Invalid vendor ID');
            }

            // Fetch vendor by ID
            const vendor = await this.vendorService.getVendorByIdService(id);
            if (!vendor) {
                throw new APIError(404, 'Vendor not found');
            }

            res.status(200).json({
                success: true,
                data: vendor
            });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                throw new APIError(503, 'Vendor service temporarily unavailable');
            }
        }
    }


    /**
     * PUT /api/vendor/:id
     * Updates vendor profile data such as business name, phone number, etc.
     *
     * @param req {VendorAuthRequest<{ id: string }, {}, IUpdateVendorRequest>} - Path param with vendor ID and request body with update data
     * @param res {Response} - Express response object
     * @returns {Promise<void>} - 200 OK with updated vendor data or appropriate error
     * @access Authenticated Vendor
     */
    async updateVendor(req: VendorAuthRequest<{ id: string }, {}, IUpdateVendorRequest>, res: Response): Promise<void> {
        try {
            // Validate request body using Zod schema
            const parsed = updateVendorSchema.safeParse(req.body);
            if (!parsed.success) {
                res.status(400).json({ success: false, errors: parsed.error.errors });
                return;
            }

            // Validate vendor ID and ensure ID consistency
            const id = parseInt(req.params.id, 10);
            if (isNaN(id)) {
                throw new APIError(400, 'Invalid vendor ID');
            }
            if (parsed.data.id !== id) {
                throw new APIError(400, 'ID in body must match URL parameter');
            }

            // Update vendor with validated data
            const updateData: IUpdateVendorRequest = { ...parsed.data, id };
            const vendor = await this.vendorService.updateVendorService(id, updateData);
            if (!vendor) {
                throw new APIError(404, 'Vendor not found');
            }

            res.status(200).json({
                success: true,
                message: 'Vendor updated successfully',
                data: { id: vendor.id, businessName: vendor.businessName, email: vendor.email, phoneNumber: vendor.phoneNumber },
            });
        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                throw new APIError(503, 'Vendor update service temporarily unavailable');
            }
        }
    }


    async approveVendor(req: AuthRequest<{ id: string }>, res: Response) {
        try {
            const vendorId = req.params.id;

            const isValid = await this.vendorService.findVendorById(Number(vendorId))

            if (!isValid.isVerified) {
                throw new APIError(400, "Vendor must be verified")
            }

            const approveVendor = await this.vendorService.approveVendor(Number(vendorId));

            if (approveVendor.affected && approveVendor.affected > 0) {
                await sendVerificationEmail(isValid.email, "You account has been approved")
                res.status(200).json({
                    success: true,
                    message: "Vendor approved ✅ "
                })
            } else {
                throw new APIError(400, "Approval failed")
            }

        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                res.status(500).json({
                    success: false,
                    msg: error
                })
            }
        }
    }


    async deleteVendor(req: AuthRequest<{ id: string }, {}, {}, {}>, res: Response) {
        try {
            const vendorId = req.params.id;

            const vendorExists = await this.vendorService.findVendorById(Number(vendorId))

            if (!vendorExists) {
                throw new APIError(404, "Vendor doesnot exists")
            }

            await this.vendorService.deleteVendor(Number(vendorId))


            res.status(200).json({
                success: true,
                msg: "Vendor deleted"
            })

        } catch (error) {
            if (error instanceof APIError) {
                res.status(error.status).json({ success: false, message: error.message });
            } else {
                throw new APIError(503, 'Vendor update service temporarily unavailable');
            }
        }
    }
}