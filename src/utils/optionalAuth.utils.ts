import { Request } from "express";
import jwt from "jsonwebtoken";

import config from "../config/env.config";

/**
 * The caller's user id, if they presented a valid session — and null if they
 * did not.
 *
 * For endpoints that cannot require authentication yet but should still refuse
 * to act across accounts. The payment routes are the case: the legacy React
 * storefront calls them with no token at all, so demanding one would stop live
 * checkouts, while a request that *does* carry a session has no business
 * touching another account's order.
 *
 * Deliberately silent on a bad token. This is not authentication — it answers
 * "who is this, if anyone", and a malformed or expired token means "nobody",
 * exactly as no token does. Anything that must actually be protected belongs
 * behind `authMiddleware`, not here.
 */
export function optionalUserIdFromRequest(req: Request): number | null {
    const bearer = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice("Bearer ".length)
        : undefined;
    const token = bearer || (req as Request & { cookies?: Record<string, string> }).cookies?.token;

    if (!token) return null;

    try {
        const decoded = jwt.verify(token, config.JWT_SECRET) as {
            id?: number;
            businessName?: string;
        };

        // A vendor token verifies against the same secret but is not a user.
        // Treating vendor id 5 as user id 5 is how an ownership check becomes a
        // vulnerability rather than a guard.
        if (decoded.businessName) return null;

        const id = Number(decoded.id);
        return Number.isInteger(id) && id > 0 ? id : null;
    } catch {
        return null;
    }
}

export type OptionalCaller =
    | { kind: "user"; id: number; role: string }
    | { kind: "vendor"; id: number };

/**
 * Who a validly signed token belongs to — a user with their role, or a vendor —
 * or null. Same caveats as `optionalUserIdFromRequest`: this widens what a
 * public read may show to its owner or the back office; it is never the gate
 * on a write.
 */
export function optionalCallerFromRequest(req: Pick<Request, "headers"> & { cookies?: Record<string, string> }): OptionalCaller | null {
    const bearer = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice("Bearer ".length)
        : undefined;
    const token = bearer || (req as Request & { cookies?: Record<string, string> }).cookies?.token;
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, config.JWT_SECRET) as {
            id?: number;
            role?: string;
            businessName?: string;
        };
        const id = Number(decoded.id);
        if (!Number.isInteger(id) || id <= 0) return null;
        if (decoded.businessName) return { kind: "vendor", id };
        return decoded.role ? { kind: "user", id, role: decoded.role } : null;
    } catch {
        return null;
    }
}

/** True for an admin or staff session, or the vendor that owns `vendorId`. */
export function canSeeHiddenCatalog(caller: OptionalCaller | null, vendorId: number | null | undefined): boolean {
    if (!caller) return false;
    if (caller.kind === "vendor") return caller.id === vendorId;
    return caller.role === "admin" || caller.role === "staff";
}
