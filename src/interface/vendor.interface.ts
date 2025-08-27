export interface IVendorSignupRequest {
    businessName: string;
    email: string;
    password: string;
    phoneNumber: string;
    district: string; // name of district (we map to entity later)
    businessRegNumber: string;
    taxNumber?: string;
    isVerified?: boolean;

    taxDocuments: string[]; // PAN/VAT documents (pdf/image links)
    citizenshipDocuments?: string[]; // optional

    chequePhoto: string; // single cheque image URL

    // ✅ Flattened bank details (from frontend.bankDetails)
    accountName: string;
    bankName: string;
    accountNumber: string;
    bankBranch: string;
    bankCode?: string;

    // handled internally
    verificationCode?: string;
    verificationCodeExpire?: Date;
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