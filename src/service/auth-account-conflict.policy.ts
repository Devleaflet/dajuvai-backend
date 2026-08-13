export const AUTH_ACCOUNT_CONFLICT_CODES = {
    VENDOR_DELETION_PENDING: "VENDOR_DELETION_PENDING",
    VENDOR_ACCOUNT_EXISTS: "VENDOR_ACCOUNT_EXISTS",
    CUSTOMER_ACCOUNT_EXISTS: "CUSTOMER_ACCOUNT_EXISTS",
    EMAIL_REGISTERED_AS_VENDOR: "EMAIL_REGISTERED_AS_VENDOR",
    EMAIL_REGISTERED_AS_CUSTOMER: "EMAIL_REGISTERED_AS_CUSTOMER",
} as const;

export type AuthAccountConflictKind =
    | "vendorDeletionPending"
    | "vendorAccountExists"
    | "customerAccountExists"
    | "emailRegisteredAsVendor"
    | "emailRegisteredAsCustomer";

export interface AuthAccountConflict {
    status: 409;
    errorCode: string;
    message: string;
}

const formatDeletionDeadline = (scheduledFor?: Date): string => {
    if (!scheduledFor) return "during the 30-day recovery period";

    return new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "UTC",
    }).format(scheduledFor);
};

export const createAuthAccountConflict = (
    kind: AuthAccountConflictKind,
    scheduledFor?: Date,
): AuthAccountConflict => {
    switch (kind) {
        case "vendorDeletionPending":
            return {
                status: 409,
                errorCode: AUTH_ACCOUNT_CONFLICT_CODES.VENDOR_DELETION_PENDING,
                message: `This vendor account is scheduled for deletion until ${formatDeletionDeadline(scheduledFor)}. Open Vendor Login and use the original email and password to reactivate it. Forgot Password is available if needed.`,
            };
        case "vendorAccountExists":
            return {
                status: 409,
                errorCode: AUTH_ACCOUNT_CONFLICT_CODES.VENDOR_ACCOUNT_EXISTS,
                message:
                    "A vendor account with this email already exists. Use Vendor Login or Forgot Password instead of creating another account.",
            };
        case "customerAccountExists":
            return {
                status: 409,
                errorCode: AUTH_ACCOUNT_CONFLICT_CODES.CUSTOMER_ACCOUNT_EXISTS,
                message:
                    "This email is already registered. Please log in or use Forgot Password to recover access.",
            };
        case "emailRegisteredAsVendor":
            return {
                status: 409,
                errorCode: AUTH_ACCOUNT_CONFLICT_CODES.EMAIL_REGISTERED_AS_VENDOR,
                message:
                    "This email is registered as a vendor account. Use Vendor Login, or use a different email for a customer account.",
            };
        case "emailRegisteredAsCustomer":
            return {
                status: 409,
                errorCode: AUTH_ACCOUNT_CONFLICT_CODES.EMAIL_REGISTERED_AS_CUSTOMER,
                message:
                    "This email is registered as a customer account. Use Customer Login, or use a different email for a vendor account.",
            };
    }
};
