import rateLimit, { type Options } from "express-rate-limit";
import type { Request } from "express";

import { publicRateLimitKey } from "./publicRateLimit.middleware";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

/**
 * One counter per route and client. A limiter mounted on several routes
 * otherwise shares one counter across all of them: forgot, reset, resend and
 * Google sign-in drew from the same five (QA BUG-020).
 */
export const perRouteClientKey = (req: Request): string =>
    `${req.baseUrl ?? ""}${req.path ?? ""}|${publicRateLimitKey(req)}`;

/**
 * Password guessing on the sign-in endpoints (customer, admin/staff, vendor).
 *
 * Keyed by client *and* account, so one shopper's typos never lock out the
 * rest of a shared network (carrier NAT puts many phones behind one IP), and
 * a guesser cannot spread attempts over many accounts from one address
 * without each account's own counter catching it. Only failed attempts count.
 */
export const credentialRateLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    // Per endpoint too: a vendor and a customer can share an email address.
    keyGenerator: ((req: Request) =>
        `${req.baseUrl ?? ""}${req.path ?? ""}|${publicRateLimitKey(req)}|${String(req.body?.email ?? "")
            .trim()
            .toLowerCase()}`) as Options["keyGenerator"],
    message: {
        success: false,
        errorCode: "TOO_MANY_ATTEMPTS",
        message: "Too many sign-in attempts. Please wait 15 minutes and try again.",
    },
});

/**
 * The same failures counted per client across every account, so rotating
 * through a list of emails from one address (credential stuffing) is slowed
 * too. Set well above what a household or office on one connection produces.
 */
export const credentialSprayLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 50,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: ((req: Request) => `${req.baseUrl ?? ""}${req.path ?? ""}|${publicRateLimitKey(req)}`) as Options["keyGenerator"],
    message: {
        success: false,
        errorCode: "TOO_MANY_ATTEMPTS",
        message: "Too many sign-in attempts. Please wait 15 minutes and try again.",
    },
});

/** Account creation, per client. Generous enough for a family on one phone. */
export const signupRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: publicRateLimitKey as Options["keyGenerator"],
    message: {
        success: false,
        errorCode: "TOO_MANY_ATTEMPTS",
        message: "Too many sign-up attempts. Please try again in an hour.",
    },
});

/**
 * Guessing on lookups that answer "does this exist": promo codes (per signed-in
 * account) and the public order tracker (per client). Generous for a shopper
 * typing a code, far too slow to enumerate (QA BUG-018, BUG-019).
 */
export const lookupRateLimiter = rateLimit({
    windowMs: FIFTEEN_MINUTES,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    keyGenerator: ((req: Request & { user?: { id?: number } }) =>
        `${req.baseUrl ?? ""}${req.path ?? ""}|${req.user?.id ? `user:${req.user.id}` : publicRateLimitKey(req)}`) as Options["keyGenerator"],
    message: {
        success: false,
        errorCode: "TOO_MANY_ATTEMPTS",
        message: "Too many attempts. Please wait a few minutes and try again.",
    },
});
