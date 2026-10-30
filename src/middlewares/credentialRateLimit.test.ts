import { describe, expect, it, vi } from "vitest";

import {
    credentialRateLimiter,
    credentialSprayLimiter,
    lookupRateLimiter,
    perRouteClientKey,
    signupRateLimiter,
} from "./credentialRateLimit.middleware";

function fakeReq(ip: string, email?: string): any {
    return { ip, app: { get: () => false }, headers: {}, body: email === undefined ? {} : { email } };
}

function fakeRes(): any {
    const res: any = { headersSent: false, statusCode: 200 };
    res.setHeader = vi.fn();
    res.on = vi.fn();
    res.status = vi.fn((code: number) => ((res.statusCode = code), res));
    res.send = vi.fn(() => res);
    res.json = vi.fn(() => res);
    return res;
}

/** Calls a limiter `n` times and returns how many were let through. */
async function passes(limiter: any, n: number, make: () => any) {
    let ok = 0;
    for (let i = 0; i < n; i++) {
        const next = vi.fn();
        await limiter(make(), fakeRes(), next);
        if (next.mock.calls.length) ok++;
    }
    return ok;
}

describe("credentialRateLimiter (QA BUG-010)", () => {
    it("blocks the 11th failed attempt for the same account from the same client", async () => {
        expect(await passes(credentialRateLimiter, 11, () => fakeReq("10.1.0.1", "victim@example.com"))).toBe(10);
    });

    it("counts the email case- and space-insensitively", async () => {
        let i = 0;
        const emails = ["Victim2@Example.com", " victim2@example.com "];
        expect(await passes(credentialRateLimiter, 11, () => fakeReq("10.1.0.2", emails[i++ % 2]))).toBe(10);
    });

    it("does not lock out another account on the same network", async () => {
        await passes(credentialRateLimiter, 11, () => fakeReq("10.1.0.3", "a@example.com"));
        expect(await passes(credentialRateLimiter, 1, () => fakeReq("10.1.0.3", "b@example.com"))).toBe(1);
    });

    it("keeps customer and vendor sign-in counters apart for the same email", async () => {
        const at = (baseUrl: string) => () => ({ ...fakeReq("10.1.0.5", "shared@example.com"), baseUrl, path: "/login" });
        await passes(credentialRateLimiter, 11, at("/api/auth"));
        expect(await passes(credentialRateLimiter, 1, at("/api/vendors"))).toBe(1);
    });

    it("answers a blocked attempt with 429", async () => {
        await passes(credentialRateLimiter, 10, () => fakeReq("10.1.0.4", "c@example.com"));
        const res = fakeRes();
        await (credentialRateLimiter as any)(fakeReq("10.1.0.4", "c@example.com"), res, vi.fn());
        expect(res.status).toHaveBeenCalledWith(429);
    });
});

describe("signupRateLimiter (QA BUG-010)", () => {
    it("allows 10 signups per client per hour, then blocks", async () => {
        let i = 0;
        expect(await passes(signupRateLimiter, 11, () => fakeReq("10.2.0.1", `n${i++}@example.com`))).toBe(10);
    });
});

describe("lookupRateLimiter (QA BUG-018, BUG-019)", () => {
    it("allows 20 lookups per signed-in account, then blocks", async () => {
        const make = () => ({ ...fakeReq("10.3.0.1"), baseUrl: "/api/order", path: "/check-promo", user: { id: 77 } });
        expect(await passes(lookupRateLimiter, 21, make)).toBe(20);
    });

    it("counts anonymous lookups per client", async () => {
        const make = () => ({ ...fakeReq("10.3.0.2"), baseUrl: "/api/order", path: "/user/track" });
        expect(await passes(lookupRateLimiter, 21, make)).toBe(20);
    });
});

// Security review of QA BUG-010: rotating emails from one client never hit
// the per-account counter, so credential stuffing went unthrottled.
describe("credentialSprayLimiter", () => {
    it("caps failed sign-ins from one client across all accounts at 50", async () => {
        let i = 0;
        const make = () => ({ ...fakeReq("10.4.0.1", `u${i++}@example.com`), baseUrl: "/api/auth", path: "/login" });
        expect(await passes(credentialSprayLimiter, 51, make)).toBe(50);
    });
});

// QA BUG-020: forgot, reset, resend, reactivate and Google sign-in shared one
// 5-per-15-minute counter, so a normal password reset could block a sign-in.
describe("perRouteClientKey", () => {
    const req = (path: string, ip = "10.5.0.1") => ({ ...fakeReq(ip), baseUrl: "/api/auth", path });

    it("counts each flow separately for the same client", () => {
        expect(perRouteClientKey(req("/forgot-password"))).not.toBe(perRouteClientKey(req("/google/mobile")));
    });

    it("counts the same flow together for the same client, apart from other clients", () => {
        expect(perRouteClientKey(req("/forgot-password"))).toBe(perRouteClientKey(req("/forgot-password")));
        expect(perRouteClientKey(req("/forgot-password"))).not.toBe(perRouteClientKey(req("/forgot-password", "10.5.0.2")));
    });
});
