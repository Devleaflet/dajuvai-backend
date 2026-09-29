import { randomBytes, timingSafeEqual } from "crypto";
import jwt from "jsonwebtoken";

import config from "../config/env.config";
import { AuthProvider, User } from "../entities/user.entity";
import { newTokenId } from "./token-revocation.service";

/**
 * Web social sign-in (Google, Facebook), shared so the two providers cannot
 * drift apart again. Facebook once linked itself to any account with a matching
 * email — password accounts included — while Google refused; one function now
 * decides for both.
 */

export type OAuthProvider = AuthProvider.GOOGLE | AuthProvider.FACEBOOK;

export interface OAuthProfile {
    id: string;
    displayName?: string;
    emails?: { value?: string }[];
}

/** What the verify step needs from the database; a TypeORM repository fits. */
export interface OAuthUserStore {
    findOne(options: { where: Partial<User> }): Promise<User | null>;
    create(data: Partial<User>): User;
    save(user: User): Promise<User>;
}

export interface OAuthDeletionService {
    finalizeUserDeletion(id: number): Promise<void>;
    reactivateOAuthUser(id: number): Promise<void>;
}

/**
 * Error codes the frontend may receive on `/auth/<provider>/callback?error=`.
 * Anything else collapses to `authentication_error`, so provider-supplied text
 * (Facebook puts free-form descriptions in its failure message) never reaches
 * the URL.
 */
export const OAUTH_ERROR_CODES = new Set([
    "access_denied",
    "authentication_error",
    "email_registered_manually",
    "google_email_required",
    "facebook_email_required",
    "invalid_state",
    "server_error",
]);

type ResolveResult = { user: User } | { error: string };

const idField = (provider: OAuthProvider) =>
    provider === AuthProvider.GOOGLE ? "googleId" : "facebookId";

/**
 * The verify step of both passport strategies.
 *
 * - A known provider id signs straight in.
 * - An unknown id with an email that already has an account links **only** if
 *   that account was created with the same provider. Linking a social identity
 *   to a password account on email alone is an account takeover whenever the
 *   provider's email is not the account owner's.
 * - No email (phone-only Facebook accounts, or the email permission declined)
 *   is refused with a code the frontend can explain.
 * - Deletion grace: signing in during the grace period reactivates; after it
 *   the old account is finalized and a fresh one is created.
 */
export async function resolveOAuthUser(
    provider: OAuthProvider,
    profile: OAuthProfile,
    users: OAuthUserStore,
    deletion: () => OAuthDeletionService,
): Promise<ResolveResult> {
    const field = idField(provider);
    const email = profile.emails?.[0]?.value?.trim().toLowerCase();

    const createUser = async () => {
        const user = users.create({
            [field]: profile.id,
            email,
            username: profile.displayName || email.split("@")[0],
            isVerified: true,
            provider,
        });
        return users.save(user);
    };

    let user = await users.findOne({ where: { [field]: profile.id } });

    if (!user) {
        if (!email) return { error: `${provider}_email_required` };

        user = await users.findOne({ where: { email } });
        if (user) {
            if (user.provider !== provider) return { error: "email_registered_manually" };
            user[field] = profile.id;
            user.isVerified = true;
            await users.save(user);
        } else {
            user = await createUser();
        }
    }

    if (user.deletionScheduledFor && !user.deletionFinalizedAt) {
        const service = deletion();
        if (user.deletionScheduledFor <= new Date()) {
            await service.finalizeUserDeletion(user.id);
            // Finalization scrubbed the old row's email, so it is free again.
            if (!email) return { error: `${provider}_email_required` };
            user = await createUser();
        } else {
            await service.reactivateOAuthUser(user.id);
        }
    }

    return { user };
}

/**
 * The same token pair password login issues: a 15-minute access token carrying
 * a `jti` (which logout revokes) and a 1-day refresh token that
 * `POST /api/auth/refresh-token` accepts.
 */
export function issueUserSessionTokens(user: Pick<User, "id" | "email" | "role">) {
    const claims = { id: user.id, email: user.email, role: user.role };
    return {
        token: jwt.sign({ ...claims, jti: newTokenId() }, config.JWT_SECRET, { expiresIn: "15m" }),
        refreshToken: jwt.sign(claims, config.JWT_REFRESH_SECRET, { expiresIn: "1d" }),
    };
}

/**
 * Where the backend sends the browser when a social sign-in ends.
 *
 * ponytail: tokens ride in the query because both the Next app and the legacy
 * React app read them there. The real fix is a single-use code exchanged
 * server-to-server; until then the Next handler strips the URL immediately.
 */
export function oauthCallbackUrl(
    frontendUrl: string,
    provider: OAuthProvider,
    outcome: { error: string } | { token: string; refreshToken: string },
): string {
    const params =
        "error" in outcome
            ? new URLSearchParams({
                  error: OAUTH_ERROR_CODES.has(outcome.error)
                      ? outcome.error
                      : "authentication_error",
              })
            : new URLSearchParams({ token: outcome.token, refreshToken: outcome.refreshToken });
    return `${frontendUrl.replace(/\/+$/, "")}/auth/${provider}/callback?${params}`;
}

/**
 * OAuth `state` without server sessions: a random nonce in a short-lived
 * httpOnly cookie on the backend's own origin, checked on the callback. Without
 * it, anyone can send a victim a callback link carrying the attacker's
 * authorization code and sign the victim into the attacker's account.
 *
 * Plugged into passport-oauth2 as `store`; it calls these with the request
 * (Express exposes the response as `req.res`).
 */
const STATE_COOKIE = "oauth_state";

export const cookieStateStore = {
    store(req: any, _meta: unknown, callback: (err: Error | null, state?: string) => void) {
        const state = randomBytes(24).toString("base64url");
        req.res.cookie(STATE_COOKIE, state, {
            httpOnly: true,
            secure: config.NODE_ENV === "production",
            // Lax: the provider's redirect back is a top-level GET navigation.
            sameSite: "lax",
            path: "/api/auth",
            maxAge: 10 * 60 * 1000,
        });
        callback(null, state);
    },

    verify(
        req: any,
        state: string,
        _meta: unknown,
        callback: (err: Error | null, ok: boolean, info?: { message: string }) => void,
    ) {
        const expected: string | undefined = req.cookies?.[STATE_COOKIE];
        req.res?.clearCookie(STATE_COOKIE, { path: "/api/auth" });
        const ok =
            typeof state === "string" &&
            typeof expected === "string" &&
            state.length === expected.length &&
            timingSafeEqual(Buffer.from(state), Buffer.from(expected));
        if (!ok) return callback(null, false, { message: "invalid_state" });
        callback(null, true);
    },
};
