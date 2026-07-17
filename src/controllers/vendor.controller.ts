import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AuthRequest, VendorAuthRequest } from "../middlewares/auth.middleware";
import { sendVerificationEmail } from "../utils/nodemailer.utils";
import { sanitizeVendor } from "../utils/sanitize.util";
import { VendorService } from "../service/vendor.service";
import {
    IVendorSignupRequest,
    IVendorLoginRequest,
    IVerificationTokenRequest,
    IResetPasswordRequest,
    IUpdateVendorRequest,
} from "../interface/vendor.interface";
import {
    vendorSignupSchema,
    vendorLoginSchema,
    verificationTokenSchema,
    resetPasswordSchema,
    IVendorSignupRequestV2,
    vendorSignupSchemav2,
    IUpdateVendorRequestV2,
    IUpdateVendorPaymentOptionRequest,
} from "../utils/zod_validations/vendor.zod";
import {
    ValidationError,
    BadRequestError,
    AuthError,
    ForbiddenError,
    NotFoundError,
    ConflictError,
    RateLimitError,
    APIError,
} from "../errors";
import { DistrictService } from "../service/district.service";
import { findUserByEmail } from "../service/user.service";
import config from "../config/env.config";

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
    private districtService: DistrictService;

    constructor() {
        this.jwtSecret = config.JWT_SECRET;
        this.vendorService = new VendorService();
        this.districtService = new DistrictService();
    }

    async getVendors(
        _req: VendorAuthRequest,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const vendors = await this.vendorService.fetchAllVendors();
        res.status(200).json({
            success: true,
            data: vendors.map((v) => sanitizeVendor(v)),
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
            await this.vendorService.findVendorByEmail(email);
        const existingUser = await findUserByEmail(email);

        if (existingUser) throw new ConflictError("User already exists");
        if (existingVendor && existingVendor.isVerified)
            throw new ConflictError("Vendor already exists");

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
        if (!vendor) throw new AuthError("Vendor does not exist");

        if (!vendor.isApproved) {
            throw new ForbiddenError(
                "Your account is not yet approved. You can only login once an admin approves you as a vendor.",
            );
        }

        const isMatch = await bcrypt.compare(password, vendor.password);
        if (!isMatch) throw new AuthError("Invalid credentials");

        const token = jwt.sign(
            {
                id: vendor.id,
                email: vendor.email,
                businessName: vendor.businessName,
            },
            this.jwtSecret,
            { expiresIn: "15m" },
        );

        const refreshToken = jwt.sign(
            {
                id: vendor.id,
                email: vendor.email,
                businessName: vendor.businessName,
            },
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

    async logout(_req: Request, res: Response): Promise<void> {
        res.clearCookie("vendorToken");
        res.clearCookie("vendorRefreshToken");
        res.status(200).json({
            success: true,
            message: "Logged out successfully",
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

        const { email } = parsed.data;
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

        const { email } = parsed.data;
        const vendor = await this.vendorService.findVendorByEmail(email);
        if (!vendor) throw new NotFoundError("Vendor");

        const token = TokenUtils.generateToken();
        const tokenExpire = new Date(Date.now() + 15 * 60 * 1000);
        vendor.resetToken = token;
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
        const vendor = await this.vendorService.findVendorByResetToken(token);
        if (!vendor) throw new BadRequestError("Reset token no longer valid");

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
            await sendVerificationEmail(
                isValid.email,
                "You account has been approved",
            );
            res.status(200).json({ success: true, message: "Vendor approved" });
        } else {
            throw new BadRequestError("Approval failed");
        }
    }

    async deleteVendor(
        req: AuthRequest<{ id: string }, {}, {}, {}>,
        res: Response,
        _next: NextFunction,
    ): Promise<void> {
        const vendorId = req.params.id || 46;

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

        const existingVendor = await this.vendorService.findVendorByEmail(
            data.email,
        );
        const existingUser = await findUserByEmail(data.email);

        if (existingUser) throw new ConflictError("User already exists");
        if (existingVendor && existingVendor.isVerified)
            throw new ConflictError("Vendor already exists");

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
