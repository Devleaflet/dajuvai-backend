import rateLimit, { Options } from "express-rate-limit";
import { CombinedAuthRequest } from "./auth.middleware";
import config from "../config/env.config";

/**
 * Keys the limit to the authenticated account, falling back to IP for
 * unauthenticated hits.
 *
 * IMPORTANT: every route using these limiters must run its auth middleware
 * FIRST. req.user/req.vendor do not exist until then, so a limiter placed
 * before auth silently keys by IP and everyone behind one NAT shares a bucket.
 * `npm run check:fcm` asserts the ordering.
 */
const keyByAccount = (req: CombinedAuthRequest) => {
    if (req.user) return `user:${req.user.id}`;
    if (req.vendor) return `vendor:${req.vendor.id}`;
    return req.ip ?? "unknown";
};

const limiter = (max: number, error: string): ReturnType<typeof rateLimit> =>
    rateLimit({
        windowMs: 60_000,
        max,
        keyGenerator: keyByAccount as Options["keyGenerator"],
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, error },
    });

// Limits are per account per minute, and scale inversely with blast radius:
// a read affects nobody, a topic broadcast reaches every subscriber.
// All tunable from .env without a code change — see env.config.ts.

/** Reads: history + stats. Cheap, no side effects, so a dashboard can poll freely. */
export const readLimiter = limiter(
    config.PUSH_RATE_READ,
    "Too many requests, please slow down",
);

/** Device register/unregister. Driven by the app, not a human. */
export const deviceRegistrationLimiter = limiter(
    config.PUSH_RATE_REGISTER,
    "Too many device registration requests",
);

/** Single-user send: reaches one person's devices. */
export const generalNotificationLimiter = limiter(
    config.PUSH_RATE_SEND,
    "Too many notifications sent, please slow down",
);

/** Multicast: up to 1000 users x their devices per call. */
export const multicastLimiter = limiter(
    config.PUSH_RATE_MULTICAST,
    "Multicast rate limit exceeded",
);

/** Topic broadcast: reaches every subscriber. Deliberately the tightest. */
export const broadcastLimiter = limiter(
    config.PUSH_RATE_BROADCAST,
    `Broadcast rate limit exceeded. Max ${config.PUSH_RATE_BROADCAST} topic sends per minute`,
);
