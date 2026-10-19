import type { Request } from "express";
import config from "../config/env.config";

/**
 * Rate-limit keying for the public, unauthenticated endpoints the vendor
 * signup wizard calls.
 *
 * Every public call arrives browser -> Next route handler -> here, so `req.ip`
 * (express-rate-limit's default key) is the Next server's address on every
 * request. Keyed that way a limiter is one global bucket: five registrations
 * per hour for the whole platform, not per visitor.
 *
 * `app.set("trust proxy", true)` would fix the address and break everything
 * else: it makes Express believe any caller's `X-Forwarded-For`, so a direct
 * request to the backend could spoof a fresh IP per attempt and walk past
 * `authRateLimiter` too. Instead the Next proxy proves who it is with a
 * shared secret, and only then is its forwarded IP believed. A secret works
 * under containerised hosting where the proxy's own address is not stable.
 *
 * Fails closed on trust: with `TRUSTED_PROXY_SECRET` unset, the headers are
 * just attacker-supplied strings, so they are ignored entirely and the key
 * falls back to `req.ip`. That degrades to the global bucket — tight, but
 * never spoofable.
 *
 * Follows the custom-`keyGenerator` pattern `pushRateLimiter.middleware.ts`
 * established.
 */

/** Real client IP, as seen by the Next proxy. */
export const CLIENT_IP_HEADER = "x-dv-client-ip";

/** Proof that the caller is the Next proxy and not a direct client. */
export const PROXY_SECRET_HEADER = "x-dv-proxy-secret";

/**
 * Node types a header as `string | string[] | undefined`, and a duplicated
 * header arrives as an array. Nothing here may throw — a limiter that throws
 * takes the endpoint down harder than no limiter at all.
 */
const headerValue = (value: string | string[] | undefined): string => {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value[0] ?? "";
    return "";
};

export const publicRateLimitKey = (req: Request): string => {
    const fallback = req.ip ?? "unknown";

    const secret = config.TRUSTED_PROXY_SECRET;
    if (!secret) return fallback;
    if (headerValue(req.headers?.[PROXY_SECRET_HEADER]) !== secret) return fallback;

    // `x-forwarded-for` style lists: the proxy sends one address, but accept
    // the list form too and take the first (the original client).
    const forwarded = headerValue(req.headers?.[CLIENT_IP_HEADER]).split(",")[0]?.trim() ?? "";
    return forwarded || fallback;
};
