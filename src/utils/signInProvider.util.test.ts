import { describe, expect, it } from "vitest";

import { deriveSignInProvider } from "./signInProvider.util";

describe("deriveSignInProvider", () => {
    it("trusts a social provider column", () => {
        expect(deriveSignInProvider({ provider: "google" })).toBe("google");
        expect(deriveSignInProvider({ provider: "facebook", googleId: "g" })).toBe("facebook");
    });

    it("reads an older facebook account saved as local from its linked id", () => {
        expect(deriveSignInProvider({ provider: "local", facebookId: "fb" })).toBe("facebook");
    });

    it("falls back to a linked google id", () => {
        expect(deriveSignInProvider({ provider: "local", googleId: "g" })).toBe("google");
    });

    it("treats everything else as email and password", () => {
        expect(deriveSignInProvider({ provider: "local" })).toBe("local");
        expect(deriveSignInProvider({ provider: null })).toBe("local");
    });
});
