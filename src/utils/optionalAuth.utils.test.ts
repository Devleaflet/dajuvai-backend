import { Request } from "express";
import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import config from "../config/env.config";
import { optionalUserIdFromRequest } from "./optionalAuth.utils";

/**
 * This helper guards the payment routes, which cannot demand a token yet — the
 * legacy storefront calls them without one. So it must answer "who is this, if
 * anyone" without ever mistaking a stranger, or a vendor, for a user.
 */
function request(headers: Record<string, string> = {}, cookies: Record<string, string> = {}) {
    return { headers, cookies } as unknown as Request;
}

const sign = (payload: Record<string, unknown>) =>
    jwt.sign(payload, config.JWT_SECRET, { expiresIn: "15m" });

describe("optionalUserIdFromRequest", () => {
    it("reads the user id from a bearer token", () => {
        const token = sign({ id: 42, email: "a@example.com", role: "user" });

        expect(optionalUserIdFromRequest(request({ authorization: `Bearer ${token}` }))).toBe(42);
    });

    it("reads it from the session cookie too", () => {
        const token = sign({ id: 7, email: "a@example.com", role: "user" });

        expect(optionalUserIdFromRequest(request({}, { token }))).toBe(7);
    });

    it("says nobody when there is no token", () => {
        expect(optionalUserIdFromRequest(request())).toBeNull();
    });

    it("says nobody for a malformed or forged token rather than throwing", () => {
        expect(optionalUserIdFromRequest(request({ authorization: "Bearer not.a.token" }))).toBeNull();
        expect(
            optionalUserIdFromRequest(
                request({ authorization: `Bearer ${jwt.sign({ id: 1 }, "wrong-secret")}` }),
            ),
        ).toBeNull();
    });

    it("never reports a vendor as a user", () => {
        // Vendor and user ids are unrelated sequences; treating vendor 5 as
        // user 5 would turn an ownership check into a way through it.
        const vendorToken = sign({ id: 5, email: "v@example.com", businessName: "Shop" });

        expect(optionalUserIdFromRequest(request({ authorization: `Bearer ${vendorToken}` }))).toBeNull();
    });

    it("says nobody for a token with no usable id", () => {
        expect(
            optionalUserIdFromRequest(request({ authorization: `Bearer ${sign({ id: 0 })}` })),
        ).toBeNull();
        expect(
            optionalUserIdFromRequest(request({ authorization: `Bearer ${sign({ email: "x" })}` })),
        ).toBeNull();
    });
});
