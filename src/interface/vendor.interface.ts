export interface IVendorSignupRequest {
    id?: number;
    businessName: string;
    email: string;
    password: string;
    phoneNumber: string;
    telePhone: string;
    district: string; 
    districtId?: number;
    businessRegNumber: string;
    taxNumber?: string;
    isVerified?: boolean;

    taxDocuments: string[]; 
    chequePhoto?: string;
    citizenshipDocuments?: string[]; 


    accountName?: string;
    bankName?: string;
    accountNumber?: string;
    bankBranch?: string;

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

export interface IUpdateVendorRequest extends IVendorSignupRequest { };
export interface IAddressRequest {
    province?: string;
    city?: string;
    streetAddress?: string;
    userId?: number;
}