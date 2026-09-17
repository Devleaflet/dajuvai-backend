import { afterEach, describe, expect, it } from "vitest";
import config from "../config/env.config";
import {
    CLIENT_IP_HEADER,
    PROXY_SECRET_HEADER,
    publicRateLimitKey,
} from "./publicRateLimit.middleware";

const SECRET = "shared-secret-value";
const original = config.TRUSTED_PROXY_SECRET;

afterEach(() => {
    config.TRUSTED_PROXY_SECRET = original;
});

const request = (headers: Record<string, string | string[]>, ip = "10.0.0.1") =>
    ({ ip, headers }) as any;

describe("publicRateLimitKey", () => {
    it("uses the forwarded client IP when the proxy secret matches", () => {
        config.TRUSTED_PROXY_SECRET = SECRET;

        const key = publicRateLimitKey(
            request({ [PROXY_SECRET_HEADER]: SECRET, [CLIENT_IP_HEADER]: "203.0.113.7" }),
        );

        expect(key).toBe("203.0.113.7");
    });

    it("takes the first entry of a comma-separated forwarded list", () => {
        config.TRUSTED_PROXY_SECRET = SECRET;

        const key = publicRateLimitKey(
            request({
                [PROXY_SECRET_HEADER]: SECRET,
                [CLIENT_IP_HEADER]: "203.0.113.7, 198.51.100.4, 10.0.0.1",
            }),
        );

        expect(key).toBe("203.0.113.7");
    });

    it("ignores the forwarded IP when the secret is wrong", () => {
        config.TRUSTED_PROXY_SECRET = SECRET;

        const key = publicRateLimitKey(
            request({ [PROXY_SECRET_HEADER]: "guessed", [CLIENT_IP_HEADER]: "203.0.113.7" }),
        );

        expect(key).toBe("10.0.0.1");
    });

    it("ignores the forwarded IP when no secret header is sent", () => {
        config.TRUSTED_PROXY_SECRET = SECRET;

        expect(publicRateLimitKey(request({ [CLIENT_IP_HEADER]: "203.0.113.7" }))).toBe("10.0.0.1");
    });

    it("fails closed on trust when the secret is unconfigured", () => {
        // Nothing is trusted, so a caller who guesses the header names still
        // cannot pick its own bucket.
        config.TRUSTED_PROXY_SECRET = "";

        const key = publicRateLimitKey(
            request({ [PROXY_SECRET_HEADER]: "", [CLIENT_IP_HEADER]: "203.0.113.7" }),
        );

        expect(key).toBe("10.0.0.1");
    });

    it.each<[string, Record<string, string | string[]>]>([
        ["empty value", { [CLIENT_IP_HEADER]: "" }],
        ["whitespace only", { [CLIENT_IP_HEADER]: "   " }],
        ["bare commas", { [CLIENT_IP_HEADER]: ",,," }],
        ["missing entirely", {}],
        ["duplicated into an array", { [CLIENT_IP_HEADER]: [] }],
    ])("falls back rather than throwing on a malformed header: %s", (_label, headers) => {
        config.TRUSTED_PROXY_SECRET = SECRET;

        expect(publicRateLimitKey(request({ [PROXY_SECRET_HEADER]: SECRET, ...headers }))).toBe(
            "10.0.0.1",
        );
    });

    it("never throws when the request carries no headers or IP at all", () => {
        config.TRUSTED_PROXY_SECRET = SECRET;

        expect(publicRateLimitKey({} as any)).toBe("unknown");
    });
});
