import dotenv from "dotenv";

dotenv.config();

const parseNumber = (value: string | undefined, fallback: number) => {
    const parsed = value ? Number.parseInt(value, 10) : NaN;
    return Number.isFinite(parsed) ? parsed : fallback;
};

const config = {
    NODE_ENV: process.env.NODE_ENV || "development",
    PORT: parseNumber(process.env.PORT, 4000),
    PAGE_LIMIT: parseNumber(process.env.PAGE_LIMIT, 20),
    DATABASE_URL: process.env.DATABASE_URL || "",
    JWT_SECRET: process.env.JWT_SECRET || "your_jwt_secret",
    JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "your_refresh_secret",
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
    GOOGLE_ANDROID_CLIENT_ID: process.env.GOOGLE_ANDROID_CLIENT_ID || "",
    GOOGLE_IOS_CLIENT_ID: process.env.GOOGLE_IOS_CLIENT_ID || "",
    GOOGLE_CALLBACK_URL:
        process.env.GOOGLE_CALLBACK_URL || "http://localhost:4000/api/auth/google/callback",
    FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID || "",
    FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET || "",
    FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
    USER_EMAIL: process.env.USER_EMAIL || "",
    PASS_EMAIL: process.env.PASS_EMAIL || "",
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
    NPS_MERCHANT_ID: process.env.NPS_MERCHANT_ID || "7468",
    NPS_API_USERNAME: process.env.NPS_API_USERNAME || "leaflet",
    NPS_API_PASSWORD: process.env.NPS_API_PASSWORD || "Leaflet@123",
    NPS_SECRET_KEY: process.env.NPS_SECRET_KEY || "Test@123Test",
    NPS_ACCESS_CODE: process.env.NPS_ACCESS_CODE || "LFD100",
    NPG_BASE_URL: process.env.NPG_BASE_URL || "",
    ESEWA_MERCHANT: process.env.ESEWA_MERCHANT || "",
    SECRET_KEY: process.env.SECRET_KEY || "",
    ESEWA_PAYMENT_URL: process.env.ESEWA_PAYMENT_URL || "",
    pagination: {
        pageLimit: parseNumber(process.env.PAGE_LIMIT, 20),
    },
};

export default config;
