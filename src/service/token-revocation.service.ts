import { randomUUID } from "crypto";
import { In, LessThan } from "typeorm";

import AppDataSource from "../config/db.config";
import { RevokedToken, TokenSubjectType } from "../entities/revokedToken.entity";

/**
 * Making a signed token stop working.
 *
 * A JWT is accepted because it verifies. Nothing about verification knows that
 * the holder logged out, that the password has changed, or that the token was
 * pasted into a support ticket. Two mechanisms close that, and they answer
 * different questions:
 *
 * - `revokeToken` withdraws **one** token, by its `jti`. That is logout.
 * - `tokensValidFrom` on the account withdraws **every** token issued before a
 *   moment. That is a password change, a reset, or an admin ending all
 *   sessions — including tokens we have never seen.
 *
 * Both are checked in `authMiddleware`. Neither is retroactive to tokens signed
 * before this shipped: those carry no `jti`, and an account with a null
 * `tokensValidFrom` has revoked nothing. They simply expire as before.
 */

const revokedRepository = () => AppDataSource.getRepository(RevokedToken);

/** A fresh token id. Short enough for the column, unique enough to be a key. */
export function newTokenId(): string {
    return randomUUID();
}

/**
 * Every token this API signs is HS256. Pinning it on verify means a token
 * signed with another algorithm is refused, whatever key it was signed with.
 */
export const JWT_VERIFY_OPTIONS: { algorithms: ["HS256"] } = { algorithms: ["HS256"] };

/**
 * One id per sign-in, carried by that sign-in's access and refresh tokens and
 * by every access token the refresh token later mints. Logout revokes it, so
 * the refresh token stops working too — otherwise logging out only ends the
 * current 15-minute access token.
 */
export function newSessionId(): string {
    return randomUUID();
}

/**
 * Withdraws one token.
 *
 * `expiresAt` comes from the token's own `exp`, so the cleanup job can drop the
 * row once the token could no longer have been used. A token with no `exp` —
 * there should be none — is kept for a day.
 *
 * Idempotent: revoking twice is a no-op, which matters because logout is the
 * one request every flaky connection retries.
 */
export async function revokeToken(input: {
    jti: string;
    subjectType: TokenSubjectType;
    subjectId: number;
    expiresAtSeconds?: number | null;
    reason: string;
}): Promise<void> {
    const expiresAt = input.expiresAtSeconds
        ? new Date(input.expiresAtSeconds * 1000)
        : new Date(Date.now() + 24 * 60 * 60 * 1000);

    await revokedRepository()
        .createQueryBuilder()
        .insert()
        .into(RevokedToken)
        .values({
            jti: input.jti,
            subjectType: input.subjectType,
            subjectId: input.subjectId,
            expiresAt,
            reason: input.reason,
        })
        .orIgnore()
        .execute();
}

/** Whether this token has been withdrawn. Called on every authenticated request. */
export async function isTokenRevoked(...ids: Array<string | undefined>): Promise<boolean> {
    // Tokens signed before revocation existed carry no `jti` (or `sid`). They
    // cannot be revoked individually — `tokensValidFrom` is what covers them.
    const present = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
    if (!present.length) return false;

    return (await revokedRepository().countBy({ jti: In(present) })) > 0;
}

/**
 * Whether a token predates the account's last "sign out everywhere".
 *
 * `iat` is in seconds; the column is a timestamp. A token issued in the same
 * second as the change is treated as older, which is the safe direction: worst
 * case someone signs in again.
 */
/**
 * Refresh-token rotation that does not strand older clients.
 *
 * Every refresh hands out a new refresh token (`jti`, with its parent's id as
 * `pjti`). A token is retired only once its successor has been *used*: that
 * proves the client keeps the new tokens, so an app build that never stores
 * them keeps refreshing with its original token and keeps working.
 *
 * Presenting a retired token means two parties hold the session — the
 * classic sign of a stolen refresh token — so the whole session (`sid`) is
 * revoked and both must sign in again. Parallel requests that raced one
 * refresh are given `REFRESH_REUSE_GRACE_MS` before that applies.
 *
 * Returns false when the session was just revoked for reuse.
 */
export async function rotateRefreshToken(
    claims: { jti?: string; pjti?: string; sid?: string; exp?: number },
    subject: { type: TokenSubjectType; id: number },
): Promise<boolean> {
    if (claims.jti) {
        const graceMs = Number(process.env.REFRESH_REUSE_GRACE_MS) || 60_000;
        // Age measured in the database, so it uses one clock for both ends.
        const [retired] = await revokedRepository().query(
            `SELECT reason, EXTRACT(EPOCH FROM (LOCALTIMESTAMP - "revokedAt")) * 1000 AS "ageMs"
             FROM revoked_tokens WHERE jti = $1`,
            [claims.jti],
        );
        if (retired && !(retired.reason === "rotated" && Number(retired.ageMs) < graceMs)) {
            if (claims.sid) {
                await revokeToken({
                    jti: claims.sid,
                    subjectType: subject.type,
                    subjectId: subject.id,
                    expiresAtSeconds: claims.exp,
                    reason: "refresh-reuse",
                });
            }
            return false;
        }
    }
    if (claims.pjti) {
        await revokeToken({
            jti: claims.pjti,
            subjectType: subject.type,
            subjectId: subject.id,
            expiresAtSeconds: claims.exp,
            reason: "rotated",
        });
    }
    return true;
}

export function isIssuedBeforeCutoff(
    issuedAtSeconds: number | undefined,
    tokensValidFrom: Date | null | undefined,
): boolean {
    if (!tokensValidFrom) return false;
    if (!issuedAtSeconds) return true;

    return issuedAtSeconds * 1000 <= tokensValidFrom.getTime();
}

/**
 * Drops revoked-token rows whose tokens have expired anyway.
 *
 * Without it the table grows by one row per logout forever, and it is read on
 * every authenticated request.
 */
export async function pruneExpiredRevokedTokens(now: Date = new Date()): Promise<number> {
    const result = await revokedRepository().delete({ expiresAt: LessThan(now) });
    return result.affected ?? 0;
}
