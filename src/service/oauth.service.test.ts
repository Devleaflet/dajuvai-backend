import { describe, expect, it, vi } from "vitest";
import jwt from "jsonwebtoken";

import config from "../config/env.config";
import { AuthProvider, User } from "../entities/user.entity";
import {
    cookieStateStore,
    issueUserSessionTokens,
    oauthCallbackUrl,
    resolveOAuthUser,
} from "./oauth.service";

/** An in-memory stand-in for the User repository. */
const makeStore = (rows: Partial<User>[] = []) => {
    const users = rows.map((r, i) => ({ id: i + 1, ...r }) as User);
    return {
        users,
        findOne: vi.fn(async ({ where }: { where: Partial<User> }) => {
            const [[key, value]] = Object.entries(where);
            return users.find((u) => (u as any)[key] === value) ?? null;
        }),
        create: vi.fn((data: Partial<User>) => ({ ...data }) as User),
        save: vi.fn(async (user: User) => {
            if (!user.id) {
                user.id = users.length + 1;
                users.push(user);
            }
            return user;
        }),
    };
};

const deletion = {
    finalizeUserDeletion: vi.fn(async () => {}),
    reactivateOAuthUser: vi.fn(async () => {}),
};

const fbProfile = (email?: string) => ({
    id: "fb-123",
    displayName: "Ram Bahadur",
    emails: email ? [{ value: email }] : undefined,
});

const FB = AuthProvider.FACEBOOK;

describe("resolveOAuthUser (Facebook)", () => {
    it("creates a new user with provider=facebook", async () => {
        const store = makeStore();
        const result = await resolveOAuthUser(FB, fbProfile("Ram@Example.com"), store, () => deletion);

        expect(result).toHaveProperty("user");
        const user = (result as { user: User }).user;
        expect(user).toMatchObject({
            facebookId: "fb-123",
            email: "ram@example.com",
            username: "Ram Bahadur",
            provider: AuthProvider.FACEBOOK,
            isVerified: true,
        });
        expect(store.save).toHaveBeenCalledOnce();
    });

    it("signs in an existing Facebook user by facebookId", async () => {
        const store = makeStore([{ facebookId: "fb-123", email: "ram@example.com", provider: FB }]);
        const result = await resolveOAuthUser(FB, fbProfile("ram@example.com"), store, () => deletion);

        expect((result as { user: User }).user.id).toBe(1);
        expect(store.save).not.toHaveBeenCalled();
    });

    it("refuses to link to a password (local) account with the same email", async () => {
        const store = makeStore([{ email: "ram@example.com", provider: AuthProvider.LOCAL, password: "hash" }]);
        const result = await resolveOAuthUser(FB, fbProfile("RAM@example.com"), store, () => deletion);

        expect(result).toEqual({ error: "email_registered_manually" });
        expect(store.users[0].facebookId).toBeUndefined();
        expect(store.save).not.toHaveBeenCalled();
    });

    it("refuses to link to a Google account with the same email", async () => {
        const store = makeStore([{ email: "ram@example.com", provider: AuthProvider.GOOGLE, googleId: "g-1" }]);
        const result = await resolveOAuthUser(FB, fbProfile("ram@example.com"), store, () => deletion);

        expect(result).toEqual({ error: "email_registered_manually" });
    });

    it("refuses a Facebook profile with no email instead of crashing", async () => {
        const store = makeStore();
        expect(await resolveOAuthUser(FB, fbProfile(), store, () => deletion)).toEqual({
            error: "facebook_email_required",
        });
        expect(await resolveOAuthUser(FB, { id: "fb-9", emails: [] }, store, () => deletion)).toEqual({
            error: "facebook_email_required",
        });
        expect(store.save).not.toHaveBeenCalled();
    });

    it("reactivates an account inside its deletion grace period", async () => {
        const store = makeStore([
            { facebookId: "fb-123", provider: FB, deletionScheduledFor: new Date(Date.now() + 86_400_000) },
        ]);
        deletion.reactivateOAuthUser.mockClear();
        const result = await resolveOAuthUser(FB, fbProfile("ram@example.com"), store, () => deletion);

        expect(deletion.reactivateOAuthUser).toHaveBeenCalledWith(1);
        expect((result as { user: User }).user.id).toBe(1);
    });

    it("finalizes an expired deletion and starts a fresh account", async () => {
        const store = makeStore([
            { facebookId: "fb-123", provider: FB, deletionScheduledFor: new Date(Date.now() - 1000) },
        ]);
        deletion.finalizeUserDeletion.mockClear();
        const result = await resolveOAuthUser(FB, fbProfile("ram@example.com"), store, () => deletion);

        expect(deletion.finalizeUserDeletion).toHaveBeenCalledWith(1);
        expect((result as { user: User }).user).toMatchObject({ id: 2, provider: FB, facebookId: "fb-123" });
    });
});

describe("issueUserSessionTokens", () => {
    it("issues an access token with a jti and a refresh token the refresh endpoint verifies", () => {
        const { token, refreshToken } = issueUserSessionTokens({ id: 7, email: "a@b.c", role: "user" as any });

        const access = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
        expect(access.jti).toEqual(expect.any(String));
        expect(access.exp! - access.iat!).toBe(15 * 60);

        const refresh = jwt.verify(refreshToken, config.JWT_REFRESH_SECRET) as jwt.JwtPayload;
        expect(refresh).toMatchObject({ id: 7, email: "a@b.c", role: "user" });
        expect(refresh.exp! - refresh.iat!).toBe(24 * 60 * 60);
    });
});

describe("oauthCallbackUrl", () => {
    it("carries the token pair to the provider's frontend callback", () => {
        const url = new URL(
            oauthCallbackUrl("http://localhost:5173/", FB, { token: "a.b+c", refreshToken: "d&e" }),
        );
        expect(url.origin + url.pathname).toBe("http://localhost:5173/auth/facebook/callback");
        expect(url.searchParams.get("token")).toBe("a.b+c");
        expect(url.searchParams.get("refreshToken")).toBe("d&e");
    });

    it("passes known error codes and collapses anything else", () => {
        const known = new URL(oauthCallbackUrl("http://x.test", AuthProvider.GOOGLE, { error: "email_registered_manually" }));
        expect(known.pathname).toBe("/auth/google/callback");
        expect(known.search).toBe("?error=email_registered_manually");

        const raw = oauthCallbackUrl("http://x.test", FB, { error: "Permissions error&token=evil" });
        expect(raw).toBe("http://x.test/auth/facebook/callback?error=authentication_error");
    });
});

describe("cookieStateStore", () => {
    const run = (cookie: string | undefined, state: string | undefined) =>
        new Promise<{ ok: boolean; info?: { message: string } }>((resolve) => {
            const req = { cookies: cookie ? { oauth_state: cookie } : {}, res: { clearCookie: vi.fn() } };
            cookieStateStore.verify(req, state as string, {}, (_err, ok, info) => resolve({ ok, info }));
        });

    it("round-trips the state it stored", async () => {
        const cookie = vi.fn();
        const state = await new Promise<string>((resolve) =>
            cookieStateStore.store({ res: { cookie } }, {}, (_err, s) => resolve(s!)),
        );
        expect(cookie).toHaveBeenCalledWith("oauth_state", state, expect.objectContaining({ httpOnly: true }));
        expect((await run(state, state)).ok).toBe(true);
    });

    it("refuses a missing or mismatched state", async () => {
        expect(await run(undefined, "abc")).toEqual({ ok: false, info: { message: "invalid_state" } });
        expect(await run("abc", undefined)).toEqual({ ok: false, info: { message: "invalid_state" } });
        expect(await run("abc", "abd")).toEqual({ ok: false, info: { message: "invalid_state" } });
    });
});
