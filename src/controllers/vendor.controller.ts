import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AuthRequest, VendorAuthRequest } from "../middlewares/auth.middleware";
import {
    sendVendorApprovedEmail,
    sendVendorRejectedEmail,
    sendVerificationEmail,
} from "../utils/nodemailer.utils";
import { sanitizeVendor, sanitizeVendorForAdmin } from "../utils/sanitize.util";
import { VendorService } from "../service/vendor.service";
import { NotificationService } from "../service/notification.service";
import {
    IVendorSignupRequest,
    IVendorLoginRequest,
    IVerificationTokenRequest,
    IResetPasswordRequest,
    IUpdateVendorRequest,
    IRejectVendorRequest,
} from "../interface/vendor.interface";
import {
    vendorSignupSchema,
    vendorLoginSchema,
    verificationTokenSchema,
    resetPasswordSchema,
    IVendorSignupRequestV2,
    vendorSignupSchemav2,
    vendorDeleteAccountSchema,
    IUpdateVendorRequestV2,
    IUpdateVendorPaymentOptionRequest,
} from "../utils/zod_validations/vendor.zod";
import {
    ValidationError,
    BadRequestError,
    AuthError,
    ForbiddenError,
    NotFoundError,
    RateLimitError,
    GoneError,
    APIError,
} from "../errors";
import { DistrictService } from "../service/district.service";
import { findUserByEmail } from "../service/user.service";
import config from "../config/env.config";
import { createAuthAccountConflict } from "../service/auth-account-conflict.policy";

/**
 * Utility class for token management
 * Handles token generation and hashing
 */
class TokenUtils {
    static generateToken(): string {
        return Math.floor(100000 + Math.random() * 900000).toString();
    }

    static async hashToken(token: string): Promise<string> {
        return await bcrypt.hash(token, 10);
    }
}

export class VendorController {
    private readonly jwtSecret: string;
    private readonly vendorService: VendorService;
    private readonly notificationService: NotificationService;
    private districtService: DistrictService;

    constructor() {
        this.jwtSecret = config.JWT_SECRET;
        this.vendorService = new VendorService();
        this.notificationService = new NotificationService();
        this.districtService = new DistrictService();
    }

    private issueVendorSession(res: Response, vendor: any) {
        const token = jwt.sign(
            { id: vendor.id, email: vendor.email, businessName: vendor.businessName },
            this.jwtSecret,
            { expiresIn: "15m" },
        );
        const refreshToken = jwt.sign(
            { id: vendor.id, email: vendor.email, businessName: vendor.businessName },
            config.JWT_REFRESH_SECRET,
            { expiresIn: "7d" },
        );
        res.cookie("vendorToken", token, {
            httpOnly: true,
            secure: config.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 15 * 60 * 1000,
        });
        res.cookie("vendorRefreshToken", refreshToken, {
            httpOnly: true,
            secure: config.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });
        return { token, refreshToken };
    }

    async getVendors(
        _req: VendorAuthRequest,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const vendors = await this.vendorService.fetchAllVendors();

        const vendorForAdmin = vendors.map((v) => sanitizeVendorForAdmin(v));

        res.status(200).json({
            success: true,
            data: vendorForAdmin,
        });
    }

    async getPartialVendors(
        _req: VendorAuthRequest,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const vendors = await this.vendorService.fetchPartialVendors();
        res.status(200).json({ success: true, data: vendors });
    }

    async getUnapprovedVendorList(
        _req: AuthRequest,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const unapprovedList =
            await this.vendorService.fetchAllUnapprovedVendor();
        res.status(200).json({ success: true, data: unapprovedList });
    }

    async vendorSignup(
        req: VendorAuthRequest<{}, {}, IVendorSignupRequest>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const parsed = vendorSignupSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ValidationError(
                "Validation failed",
                parsed.error.errors.map((e) => ({
                    field: e.path.join("."),
                    message: e.message,
                })),
            );
        }

        const { email, password, district } = parsed.data;

        const existingVendor =
            await this.vendorService.findVendorForSignup(email);
        const existingUser = await findUserByEmail(email);

        if (existingUser) {
            const conflict = createAuthAccountConflict(
                "emailRegisteredAsCustomer",
            );
            throw new APIError(
                conflict.status,
                conflict.message,
                conflict.errorCode,
            );
        }
        if (existingVendor?.deletionRequestedAt && !existingVendor.deletionFinalizedAt) {
            const conflict = createAuthAccountConflict(
                "vendorDeletionPending",
                existingVendor.deletionScheduledFor,
            );
            throw new APIError(conflict.status, conflict.message, conflict.errorCode);
        }
        if (existingVendor) {
            const conflict = createAuthAccountConflict("vendorAccountExists");
            throw new APIError(
                conflict.status,
                conflict.message,
                conflict.errorCode,
            );
        }

        const districtEntity =
            await this.districtService.findDistrictByName(district);
        if (!districtEntity)
            throw new BadRequestError("District does not exist");

        const hashedPassword = await bcrypt.hash(password, 10);
        const verificationToken = TokenUtils.generateToken();
        const hashedToken = await TokenUtils.hashToken(verificationToken);
        const verificationCodeExpire = new Date(Date.now() + 15 * 60 * 1000);

        const vendor = await this.vendorService.createVendor({
            ...req.body,
            password: hashedPassword,
            verificationCode: hashedToken,
            verificationCodeExpire,
        });

        await sendVerificationEmail(
            email,
            "Vendor Email Verification",
            verificationToken,
        );

        const token = jwt.sign(
            {
                id: vendor.id,
                email: vendor.email,
                businessName: vendor.businessName,
            },
            this.jwtSecret,
            { expiresIn: "2h" },
        );

        res.cookie("vendorToken", token, {
            httpOnly: true,
            secure: config.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 2 * 60 * 60 * 1000,
        });

        res.status(201).json({
            success: true,
            vendor: sanitizeVendor(vendor),
            token,
        });
    }

    async login(
        req: VendorAuthRequest<{}, {}, IVendorLoginRequest>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const parsed = vendorLoginSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ValidationError(
                "Validation failed",
                parsed.error.errors.map((e) => ({
                    field: e.path.join("."),
                    message: e.message,
                })),
            );
        }

        const { email, password } = parsed.data;
        const vendor = await this.vendorService.findVendorByEmailLogin(email);
        if (!vendor) {
            const customer = await findUserByEmail(email);
            if (customer) {
                const conflict = createAuthAccountConflict(
                    "emailRegisteredAsCustomer",
                );
                throw new APIError(
                    conflict.status,
                    conflict.message,
                    conflict.errorCode,
                );
            }
            throw new AuthError("Vendor account does not exist");
        }

        const isMatch = await bcrypt.compare(password, vendor.password);
        if (!isMatch) throw new AuthError("Invalid credentials");

        if (vendor.deletionRequestedAt && !vendor.deletionFinalizedAt) {
            if (vendor.deletionScheduledFor && vendor.deletionScheduledFor <= new Date()) {
                await this.vendorService.finalizeVendorDeletion(vendor.id);
                throw new AuthError("Vendor does not exist");
            }
            throw new APIError(
                409,
                `Account scheduled for deletion until ${vendor.deletionScheduledFor?.toISOString()}. Reactivate it to continue.`,
                "VENDOR_DELETION_PENDING",
            );
        }

        if (!vendor.isApproved) {
            throw new ForbiddenError(
                "Your account is not yet approved. You can only login once an admin approves you as a vendor.",
            );
        }

        const { token, refreshToken } = this.issueVendorSession(res, vendor);

        res.status(200).json({
            success: true,
            vendor: {
                id: vendor.id,
                email: vendor.email,
                businessName: vendor.businessName,
                profilePicture: vendor.profilePicture,
            },
            token,
            refreshToken,
        });
    }

    async refreshToken(
        req: Request,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const token =
            req.cookies.vendorRefreshToken ||
            req.headers.authorization?.split(" ")[1];

        if (!token) throw new AuthError("Refresh token missing");

        const decoded = jwt.verify(token, config.JWT_REFRESH_SECRET) as {
            id: number;
            email: string;
            businessName: string;
        };

        const vendor = await this.vendorService.findVendorByEmailLogin(
            decoded.email,
        );
        if (!vendor) throw new AuthError("Vendor not found");

        const newAccessToken = jwt.sign(
            {
                id: vendor.id,
                email: vendor.email,
                businessName: vendor.businessName,
            },
            this.jwtSecret,
            { expiresIn: "15m" },
        );

        res.cookie("vendorToken", newAccessToken, {
            httpOnly: true,
            secure: config.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 15 * 60 * 1000,
        });

        res.status(200).json({ success: true, token: newAccessToken });
    }

    async reactivate(
        req: Request<{}, {}, IVendorLoginRequest>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const parsed = vendorLoginSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ValidationError(
                "Validation failed",
                parsed.error.errors.map((e) => ({ field: e.path.join("."), message: e.message })),
            );
        }
        const vendor = await this.vendorService.reactivateVendor(
            parsed.data.email,
            parsed.data.password,
        );
        if (!vendor.isApproved) throw new ForbiddenError("Your account is not yet approved");
        const { token, refreshToken } = this.issueVendorSession(res, vendor);
        void this.notificationService.notifyVendorAccountEvent(
            vendor,
            "Vendor Account Reactivated",
            "Your vendor account and archived products have been restored.",
            "VENDOR_REACTIVATED",
        ).catch((error) => console.error("Failed to send vendor reactivation notification:", error));
        res.status(200).json({
            success: true,
            message: "Vendor account reactivated successfully",
            vendor: {
                id: vendor.id,
                email: vendor.email,
                businessName: vendor.businessName,
                profilePicture: vendor.profilePicture,
            },
            token,
            refreshToken,
        });
    }

    async logout(_req: Request, res: Response): Promise<void> {
        res.clearCookie("vendorToken");
        res.clearCookie("vendorRefreshToken");
        res.status(200).json({
            success: true,
            message: "Logged out successfully",
        });
    }

    async requestAccountDeletion(
        req: VendorAuthRequest<{}, {}, { email: string; password: string; confirmation: "DELETE" }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const parsed = vendorDeleteAccountSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ValidationError(
                "Validation failed",
                parsed.error.errors.map((e) => ({ field: e.path.join("."), message: e.message })),
            );
        }
        if (!req.vendor) throw new AuthError("Authentication required");
        const scheduledFor = await this.vendorService.requestAccountDeletion(
            req.vendor.id,
            parsed.data.email,
            parsed.data.password,
        );
        void this.notificationService.notifyVendorAccountEvent(
            { id: req.vendor.id, email: parsed.data.email },
            "Vendor Account Deletion Scheduled",
            `Your account is scheduled for deletion on ${scheduledFor.toLocaleDateString("en-CA")}. Sign in and reactivate before that date to keep your account and products.`,
            "VENDOR_DELETION_REQUESTED",
        ).catch((error) => console.error("Failed to send vendor deletion notification:", error));
        res.clearCookie("vendorToken");
        res.clearCookie("vendorRefreshToken");
        res.status(202).json({
            success: true,
            message: "Account scheduled for deletion. You can reactivate it before the deadline.",
            deletionScheduledFor: scheduledFor,
        });
    }

    async sendVerificationToken(
        req: VendorAuthRequest<{}, {}, IVerificationTokenRequest>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const parsed = verificationTokenSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ValidationError(
                "Validation failed",
                parsed.error.errors.map((e) => ({
                    field: e.path.join("."),
                    message: e.message,
                })),
            );
        }

        const email = parsed.data.email.trim().toLowerCase();
        const vendor = await this.vendorService.findVendorByEmail(email);
        if (!vendor) throw new NotFoundError("Vendor");

        const now = new Date();
        if (vendor.resendBlockUntil && vendor.resendBlockUntil > now) {
            const remainingSeconds = Math.ceil(
                (vendor.resendBlockUntil.getTime() - now.getTime()) / 1000,
            );
            const remainingMinutes = Math.ceil(remainingSeconds / 60);
            throw new RateLimitError(
                `Too many verification attempts. Please try again in ${remainingMinutes} minute(s).`,
            );
        }

        if (vendor.resendCount >= 3) {
            vendor.resendCount = 0;
            vendor.resendBlockUntil = null;
        }

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
        await sendVerificationEmail(
            vendor.email,
            "Vendor Email Verification",
            verificationToken,
        );

        res.status(202).json({
            success: true,
            message: "Verification token sent",
        });
    }

    async forgotPassword(
        req: VendorAuthRequest<{}, {}, IVerificationTokenRequest>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const parsed = verificationTokenSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ValidationError(
                "Validation failed",
                parsed.error.errors.map((e) => ({
                    field: e.path.join("."),
                    message: e.message,
                })),
            );
        }

        const email = parsed.data.email.trim().toLowerCase();
        const vendor = await this.vendorService.findVendorByEmail(email);
        if (!vendor) {
            throw new APIError(
                404,
                "vendor does not exist for provided mail.",
            );
        }

        const token = TokenUtils.generateToken();
        const hashedToken = await TokenUtils.hashToken(token);
        const tokenExpire = new Date(Date.now() + 15 * 60 * 1000);
        vendor.resetToken = hashedToken;
        vendor.resetTokenExpire = tokenExpire;
        await this.vendorService.saveVendor(vendor);

        await sendVerificationEmail(vendor.email, "Reset Password", token);

        res.status(202).json({
            success: true,
            message: "Password reset request sent",
        });
    }

    async resetPassword(
        req: VendorAuthRequest<{}, {}, IResetPasswordRequest>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const parsed = resetPasswordSchema.safeParse(req.body);
        if (!parsed.success) {
            throw new ValidationError(
                "Validation failed",
                parsed.error.errors.map((e) => ({
                    field: e.path.join("."),
                    message: e.message,
                })),
            );
        }

        const { newPass, token } = parsed.data;
        const email = parsed.data.email.trim().toLowerCase();
        const vendor = await this.vendorService.findVendorByEmail(email);
        if (!vendor) {
            throw new APIError(
                404,
                "vendor does not exist for provided mail.",
            );
        }
        if (!vendor.resetToken || !vendor.resetTokenExpire) {
            throw new GoneError("Reset token no longer valid");
        }
        if (vendor.resetTokenExpire < new Date()) {
            throw new GoneError("Reset token expired");
        }
        const isMatch =
            vendor.resetToken === token ||
            (await bcrypt.compare(token, vendor.resetToken));
        if (!isMatch) throw new BadRequestError("Invalid reset token");

        const hashedPassword = await bcrypt.hash(newPass, 10);
        vendor.password = hashedPassword;
        vendor.resetToken = null;
        vendor.resetTokenExpire = null;
        await this.vendorService.saveVendor(vendor);

        res.status(200).json({
            success: true,
            message: "Password reset successfully",
        });
    }

    async getVendorById(
        req: VendorAuthRequest<{ id: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const id = parseInt(req.params.id, 10);
        if (isNaN(id)) throw new BadRequestError("Invalid vendor ID");

        const vendor = await this.vendorService.getVendorByIdService(id);
        if (!vendor) throw new NotFoundError("Vendor");

        res.status(200).json({
            success: true,
            data: { ...vendor, password: null },
        });
    }

    async authVendor(
        req: VendorAuthRequest,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const vendor = req.vendor;
        const getVendor = await this.vendorService.findVendorById(vendor.id);
        if (!getVendor) throw new NotFoundError("Vendor");

        res.status(200).json({
            success: true,
            vendor: { ...getVendor, password: null },
        });
    }

    async updateVendor(
        req: VendorAuthRequest<
            { id: string },
            {},
            Partial<IUpdateVendorRequest>
        >,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const id = req.params.id;

        const findVendorById = await this.vendorService.findVendorById(
            Number(id),
        );
        if (!findVendorById) throw new NotFoundError("Vendor");

        const data: Partial<IUpdateVendorRequest> = req.body;
        let updateVendorData = { ...data };

        if (data.district) {
            const districtExists =
                await this.districtService.findDistrictByName(data.district);
            if (!districtExists) throw new NotFoundError("District");

            updateVendorData = { ...data, districtId: districtExists.id };
        }

        const updateVendor = await this.vendorService.updateVendorService(
            Number(id),
            updateVendorData,
        );

        res.status(200).json({
            success: true,
            message: "Vendor updated successfully",
            data: {
                id: updateVendor.id,
                businessName: updateVendor.businessName,
                email: updateVendor.email,
                phoneNumber: updateVendor.phoneNumber,
                telephone: updateVendor.telePhone,
                district: updateVendor.district,
                profilePicture: updateVendor.profilePicture,
            },
        });
    }

    async approveVendor(
        req: AuthRequest<{ id: string }>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const vendorId = req.params.id;

        const isValid = await this.vendorService.findVendorById(
            Number(vendorId),
        );
        if (!isValid.isVerified)
            throw new BadRequestError("Vendor must be verified");

        const approveVendor = await this.vendorService.approveVendor(
            Number(vendorId),
        );

        if (approveVendor.affected && approveVendor.affected > 0) {
            await sendVendorApprovedEmail(isValid.email, isValid.businessName);
            res.status(200).json({ success: true, message: "Vendor approved" });
        } else {
            throw new BadRequestError("Approval failed");
        }
    }

    async rejectVendor(
        req: AuthRequest<{ id: string }, {}, IRejectVendorRequest>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const vendorId = req.params.id;
        const rejectionReason = req.body.rejectionReason;

        const isValid = await this.vendorService.findVendorById(
            Number(vendorId),
        );
        if (!isValid.isVerified)
            throw new BadRequestError("Vendor must be verified");

        // delete vendor completely as it was before
        const rejectVendor = await this.vendorService.deleteVendor(
            Number(vendorId),
        );

        if (rejectVendor.affected && rejectVendor.affected > 0) {
            await sendVendorRejectedEmail(
                isValid.email,
                isValid.businessName,
                rejectionReason,
            );
            res.status(200).json({ success: true, message: "Vendor rejected" });
        } else {
            throw new BadRequestError("Rejection failed");
        }
    }

    async deleteVendor(
        req: AuthRequest<{ id: string }, {}, {}, {}>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const vendorId = req.params.id;

        if (!vendorId) {
            throw new BadRequestError("Vendor ID is required");
        }

        const vendorExists = await this.vendorService.findVendorById(
            Number(vendorId),
        );
        if (!vendorExists) throw new NotFoundError("Vendor");

        const productExists = await this.vendorService.checkVendorProduct(
            Number(vendorId),
        );

        if (productExists) {
            throw new APIError(
                400,
                "Vendor delete failed , This vendor has active products ",
            );
        }

        await this.vendorService.deleteVendor(Number(vendorId));

        res.status(200).json({ success: true, msg: "Vendor deleted" });
    }

    async vendorSignupV2(
        req: VendorAuthRequest<{}, {}, IVendorSignupRequestV2>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const parsed = vendorSignupSchemav2.safeParse(req.body);
        if (!parsed.success) {
            throw new ValidationError(
                "Validation failed",
                parsed.error.errors.map((e) => ({
                    field: e.path.join("."),
                    message: e.message,
                })),
            );
        }

        const data = parsed.data;

        const existingVendor = await this.vendorService.findVendorForSignup(
            data.email,
        );
        const existingUser = await findUserByEmail(data.email);

        if (existingUser) {
            const conflict = createAuthAccountConflict(
                "emailRegisteredAsCustomer",
            );
            throw new APIError(
                conflict.status,
                conflict.message,
                conflict.errorCode,
            );
        }
        if (existingVendor?.deletionRequestedAt && !existingVendor.deletionFinalizedAt) {
            const conflict = createAuthAccountConflict(
                "vendorDeletionPending",
                existingVendor.deletionScheduledFor,
            );
            throw new APIError(conflict.status, conflict.message, conflict.errorCode);
        }
        if (existingVendor) {
            const conflict = createAuthAccountConflict("vendorAccountExists");
            throw new APIError(
                conflict.status,
                conflict.message,
                conflict.errorCode,
            );
        }

        const districtEntity = await this.districtService.findDistrictByName(
            data.district,
        );
        if (!districtEntity)
            throw new BadRequestError("District does not exist");

        const hashedPassword = await bcrypt.hash(data.password, 10);

        const verificationToken = TokenUtils.generateToken();
        const hashedToken = await TokenUtils.hashToken(verificationToken);
        const verificationCodeExpire = new Date(Date.now() + 15 * 60 * 1000);

        const vendor = await this.vendorService.createVendorV2({
            ...data,
            password: hashedPassword,
            verificationCode: hashedToken,
            verificationCodeExpire,
            districtEntity,
        });

        await sendVerificationEmail(
            data.email,
            "Vendor Email Verification",
            verificationToken,
        );

        const token = jwt.sign(
            {
                id: vendor.id,
                email: vendor.email,
                businessName: vendor.businessName,
            },
            this.jwtSecret,
            { expiresIn: "2h" },
        );

        res.cookie("vendorToken", token, {
            httpOnly: true,
            secure: config.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 2 * 60 * 60 * 1000,
        });

        res.status(201).json({
            success: true,
            message:
                "Your account has been successfully registered. Our admin team will review your application within 5 business days",
            token,
        });
    }

    async updateVendorV2(
        req: VendorAuthRequest<
            { id: string },
            {},
            Partial<IUpdateVendorRequestV2>
        >,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const id = Number(req.params.id);

        const vendor = await this.vendorService.findVendorById(id);
        if (!vendor) throw new NotFoundError("Vendor");

        const updatedVendor = await this.vendorService.updateVendorServiceV2(
            id,
            req.body,
        );

        res.status(200).json({
            success: true,
            message: "Vendor updated successfully",
            data: sanitizeVendor(updatedVendor),
        });
    }

    async updatePaymentOption(
        req: VendorAuthRequest<
            { vendorId: string; paymentOptionId: string },
            {},
            Partial<IUpdateVendorPaymentOptionRequest>
        >,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const vendorId = Number(req.params.vendorId);
        const paymentOptionId = Number(req.params.paymentOptionId);

        const updated = await this.vendorService.updatePaymentOptionService(
            vendorId,
            paymentOptionId,
            req.body,
        );

        res.status(200).json({
            success: true,
            message: "Payment option updated successfully",
            data: (() => {
                const { vendor: _v, ...safe } = updated;
                return safe;
            })(),
        });
    }
}
