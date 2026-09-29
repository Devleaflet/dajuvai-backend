import dotenv from "dotenv";

dotenv.config();

const parseNumber = (value: string | undefined, fallback: number) => {
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
};

const googleCallbackUrl =
  process.env.GOOGLE_CALLBACK_URL || "http://localhost:4000/api/auth/google/callback";

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
  // Must match the "Authorized redirect URI" in the Google Cloud console
  // exactly: <backend origin>/api/auth/google/callback.
  GOOGLE_CALLBACK_URL: googleCallbackUrl,
  FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID || "",
  FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET || "",
  // Must match a "Valid OAuth Redirect URI" in the Meta app's Facebook Login
  // settings: <backend origin>/api/auth/facebook/callback. Defaults to the
  // Google callback's origin, since both are served by this backend.
  FACEBOOK_CALLBACK_URL:
    process.env.FACEBOOK_CALLBACK_URL ||
    googleCallbackUrl.replace(/\/google\/callback\/?$/, "/facebook/callback"),
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:5173",
  // The logo in every email header. Hosted on Cloudinary as a trimmed PNG:
  // email clients do not all show WebP, and inline attachments get clipped.
  EMAIL_LOGO_URL:
    process.env.EMAIL_LOGO_URL ||
    "https://res.cloudinary.com/dlzoli69m/image/upload/e_trim/h_144,c_scale/v1790626996/dajuvai/brand/email-logo.png",
  USER_EMAIL: process.env.USER_EMAIL || "",
  PASS_EMAIL: process.env.PASS_EMAIL || "",
  FIREBASE_SERVICE_ACCOUNT_BASE64:
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "",
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || "",
  /**
   * Shared secret proving a request came through the Next console's proxy,
   * so the client IP it forwards can be trusted for rate-limit keying on the
   * public endpoints. Must match `TRUSTED_PROXY_SECRET` in dajuvai_next.
   *
   * Empty by default, and empty means "trust nothing": the forwarded IP is
   * ignored and public limiters key by `req.ip`. Set it in production or
   * every public limiter becomes one global bucket — see
   * `src/middlewares/publicRateLimit.middleware.ts`.
   */
  TRUSTED_PROXY_SECRET: process.env.TRUSTED_PROXY_SECRET || "",
  PUSH_RATE_READ: parseNumber(process.env.PUSH_RATE_READ, 300),
  PUSH_RATE_REGISTER: parseNumber(process.env.PUSH_RATE_REGISTER, 60),
  PUSH_RATE_SEND: parseNumber(process.env.PUSH_RATE_SEND, 120),
  PUSH_RATE_MULTICAST: parseNumber(process.env.PUSH_RATE_MULTICAST, 30),
  PUSH_RATE_BROADCAST: parseNumber(process.env.PUSH_RATE_BROADCAST, 15),
  // Broadcast campaigns queue through Redis (BullMQ). Without REDIS_URL, or
  // with BROADCAST_ENABLED unset, drafts can still be written but nothing sends.
  BROADCAST_ENABLED: process.env.BROADCAST_ENABLED === "true",
  REDIS_URL: process.env.REDIS_URL || "",
  // Dedicated SMTP for campaign mail; falls back to the Gmail account above,
  // which Google caps at roughly 500 messages a day.
  SMTP_HOST: process.env.SMTP_HOST || "",
  SMTP_PORT: parseNumber(process.env.SMTP_PORT, 587),
  SMTP_SECURE: process.env.SMTP_SECURE === "true",
  SMTP_USER: process.env.SMTP_USER || "",
  SMTP_PASSWORD: process.env.SMTP_PASSWORD || "",
  BROADCAST_EMAIL_CONCURRENCY: parseNumber(process.env.BROADCAST_EMAIL_CONCURRENCY, 5),
  BROADCAST_EMAIL_BATCH: parseNumber(process.env.BROADCAST_EMAIL_BATCH, 50),
  BROADCAST_FCM_BATCH: parseNumber(process.env.BROADCAST_FCM_BATCH, 200),
  BROADCAST_INAPP_BATCH: parseNumber(process.env.BROADCAST_INAPP_BATCH, 500),
  BROADCAST_RETRY_ATTEMPTS: parseNumber(process.env.BROADCAST_RETRY_ATTEMPTS, 3),
  // Records every push and email as skipped instead of sending it. In-app
  // notifications are still written: they never leave the database.
  BROADCAST_DRY_RUN: process.env.BROADCAST_DRY_RUN === "true",
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || "",
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || "",
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || "",
  // Payment credentials come from the environment only. A credential in
  // source is readable by everyone with repository access, forever, and a
  // missing one should fail loudly rather than fall back to a shared value.
  NPS_MERCHANT_ID: process.env.NPS_MERCHANT_ID || "",
  NPS_API_USERNAME: process.env.NPS_API_USERNAME || "",
  NPS_API_PASSWORD: process.env.NPS_API_PASSWORD || "",
  // No fallback: a secret that lives in source can sign a forged "paid" callback.
  NPS_SECRET_KEY: process.env.NPS_SECRET_KEY || "",
  NPS_ACCESS_CODE: process.env.NPS_ACCESS_CODE || "",
  NPS_GATEWAY_URL:
    process.env.NPS_GATEWAY_URL || "https://gateway.nepalpayment.com/",
  NPG_BASE_URL: process.env.NPG_BASE_URL || "",
  NPX_MERCHANT_ID: process.env.NPX_MERCHANT_ID || "",
  NPX_MERCHANT_NAME: process.env.NPX_MERCHANT_NAME || "",
  NPX_API_USERNAME: process.env.NPX_API_USERNAME || "",
  NPX_API_PASSWORD: process.env.NPX_API_PASSWORD || "",
  NPX_SECRET_KEY: process.env.NPX_SECRET_KEY || "",
  NPX_BASE_URL:
    process.env.NPX_BASE_URL || "https://apigateway.nepalpayment.com",

  ESEWA_MERCHANT: process.env.ESEWA_MERCHANT || "",
  SECRET_KEY: process.env.SECRET_KEY || "",
  ESEWA_PAYMENT_URL: process.env.ESEWA_PAYMENT_URL || "",
  pagination: {
    pageLimit: parseNumber(process.env.PAGE_LIMIT, 20),
  },
};

/**
 * Names of required settings that are empty. Checked once at startup: the
 * server refuses to boot in production without the secrets that sign
 * sessions, and says which payment integrations are switched off.
 */
export const missingConfig = () => ({
    required: (["DATABASE_URL", "JWT_SECRET", "JWT_REFRESH_SECRET"] as const).filter((key) => !config[key]),
    payments: ([
        "NPX_MERCHANT_ID",
        "NPX_MERCHANT_NAME",
        "NPX_API_USERNAME",
        "NPX_API_PASSWORD",
        "NPX_SECRET_KEY",
        "ESEWA_MERCHANT",
        "SECRET_KEY",
        "ESEWA_PAYMENT_URL",
    ] as const).filter((key) => !config[key]),
});

export default config;
