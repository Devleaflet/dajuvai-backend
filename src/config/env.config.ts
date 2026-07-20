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
  JWT_SECRET: process.env.JWT_SECRET || "",
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET || "",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  GOOGLE_ANDROID_CLIENT_ID: process.env.GOOGLE_ANDROID_CLIENT_ID || "",
  GOOGLE_IOS_CLIENT_ID: process.env.GOOGLE_IOS_CLIENT_ID || "",
  GOOGLE_CALLBACK_URL:
    process.env.GOOGLE_CALLBACK_URL ||
    "http://localhost:4000/api/auth/google/callback",
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID || "",
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET || "",
  FACEBOOK_CALLBACK_URL: process.env.FACEBOOK_CALLBACK_URL || "",
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
  USER_EMAIL: process.env.USER_EMAIL || "",
  PASS_EMAIL: process.env.PASS_EMAIL || "",
  FIREBASE_SERVICE_ACCOUNT_BASE64:
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "",
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "",
  PUSH_RATE_READ: parseNumber(process.env.PUSH_RATE_READ, 300),
  PUSH_RATE_REGISTER: parseNumber(process.env.PUSH_RATE_REGISTER, 60),
  PUSH_RATE_SEND: parseNumber(process.env.PUSH_RATE_SEND, 120),
  PUSH_RATE_MULTICAST: parseNumber(process.env.PUSH_RATE_MULTICAST, 30),
  PUSH_RATE_BROADCAST: parseNumber(process.env.PUSH_RATE_BROADCAST, 15),
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
  NPS_MERCHANT_ID: process.env.NPS_MERCHANT_ID || "7468",
  NPS_API_USERNAME: process.env.NPS_API_USERNAME || "leaflet",
  NPS_API_PASSWORD: process.env.NPS_API_PASSWORD || "Leaflet@123",
  NPS_SECRET_KEY: process.env.NPS_SECRET_KEY || "Test@123Test",
  NPS_ACCESS_CODE: process.env.NPS_ACCESS_CODE || "LFD100",
  NPS_GATEWAY_URL:
    process.env.NPS_GATEWAY_URL || "https://gateway.nepalpayment.com/",
  NPG_BASE_URL: process.env.NPG_BASE_URL || "",
  NPX_MERCHANT_ID: process.env.NPX_MERCHANT_ID || "545",
  NPX_MERCHANT_NAME: process.env.NPX_MERCHANT_NAME || "dajuvaiapi",
  NPX_API_USERNAME: process.env.NPX_API_USERNAME || "dajuvaiapi",
  NPX_API_PASSWORD: process.env.NPX_API_PASSWORD || "W#8rXp2!kL9z@Vm",
  NPX_SECRET_KEY: process.env.NPX_SECRET_KEY || "gT7$yMn#45v!QbA",
  NPX_BASE_URL:
    process.env.NPX_BASE_URL || "https://apigateway.nepalpayment.com",

  ESEWA_MERCHANT: process.env.ESEWA_MERCHANT || "",
  SECRET_KEY: process.env.SECRET_KEY || "",
  ESEWA_PAYMENT_URL: process.env.ESEWA_PAYMENT_URL || "",
  pagination: {
    pageLimit: parseNumber(process.env.PAGE_LIMIT, 20),
  },
};

export default config;
