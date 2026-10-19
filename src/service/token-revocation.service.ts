import { randomUUID } from "crypto";
import { LessThan } from "typeorm";

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
export async function isTokenRevoked(jti: string | undefined): Promise<boolean> {
    // Tokens signed before revocation existed carry no `jti`. They cannot be
    // revoked individually — `tokensValidFrom` is what covers them.
    if (!jti) return false;

    return (await revokedRepository().countBy({ jti })) > 0;
}

/**
 * Whether a token predates the account's last "sign out everywhere".
 *
 * `iat` is in seconds; the column is a timestamp. A token issued in the same
 * second as the change is treated as older, which is the safe direction: worst
 * case someone signs in again.
 */
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
