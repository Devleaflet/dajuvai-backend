import { describe, expect, it } from "vitest";

import { isIssuedBeforeCutoff, newTokenId } from "./token-revocation.service";

/**
 * `tokensValidFrom` is how one write ends every session an account has — a
 * password reset, a forced sign-out. The comparison decides whether a token
 * that still verifies is nonetheless too old to accept, so its edges matter
 * more than its middle.
 */
describe("isIssuedBeforeCutoff", () => {
    const cutoff = new Date("2026-09-19T10:00:00.000Z");
    const seconds = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

    it("accepts every token when nothing has been revoked", () => {
        // The state of every account that predates this column.
        expect(isIssuedBeforeCutoff(seconds("2020-01-01T00:00:00Z"), null)).toBe(false);
        expect(isIssuedBeforeCutoff(seconds("2020-01-01T00:00:00Z"), undefined)).toBe(false);
    });

    it("refuses a token issued before the cutoff", () => {
        expect(isIssuedBeforeCutoff(seconds("2026-09-19T09:59:00Z"), cutoff)).toBe(true);
    });

    it("accepts a token issued after the cutoff", () => {
        expect(isIssuedBeforeCutoff(seconds("2026-09-19T10:00:01Z"), cutoff)).toBe(false);
    });

    it("refuses a token issued in the same second as the cutoff", () => {
        // `iat` has one-second resolution, so a token minted in the same second
        // as the password change cannot be proven to be the new one. Refusing
        // costs one extra sign-in; accepting keeps an attacker's session alive.
        expect(isIssuedBeforeCutoff(seconds("2026-09-19T10:00:00Z"), cutoff)).toBe(true);
    });

    it("refuses a token with no issued-at claim once a cutoff exists", () => {
        // Cannot be shown to be newer than the revocation, so it is not.
        expect(isIssuedBeforeCutoff(undefined, cutoff)).toBe(true);
    });
});

describe("newTokenId", () => {
    it("is unique per call and fits the column", () => {
        const ids = new Set(Array.from({ length: 500 }, () => newTokenId()));

        expect(ids.size).toBe(500);
        for (const id of ids) expect(id.length).toBeLessThanOrEqual(64);
    });
});
