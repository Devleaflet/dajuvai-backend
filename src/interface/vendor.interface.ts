export interface IVendorSignupRequest {
    businessName: string;
    email: string;
    password: string;
    phoneNumber: string;
    verificationCode: string,
    verificationCodeExpire: Date,
    district: string;
    isVerified: Boolean;
}

export interface IVendorLoginRequest {
    email: string;
    password: string;
}

export interface IVerificationTokenRequest {
    email: string;
}

export interface IVerifyTokenRequest {
    email: string;
    token: string;
}

export interface IResetPasswordRequest {
    newPass: string;
    confirmPass: string;
    token: string;
}

export interface IUpdateVendorRequest {
    id: number;
    businessName?: string;
    email?: string;
    businessAddress?: string;
    phoneNumber?: string;
}

export interface IAddressRequest {
    province?: string;
    city?: string;
    streetAddress?: string;
    userId?: number;
}