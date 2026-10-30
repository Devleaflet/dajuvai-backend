import crypto from "crypto";
import { describe, expect, it } from "vitest";

import { parseFacebookSignedRequest } from "./facebookSignedRequest";

const SECRET = "fb-app-secret";

const b64url = (input: Buffer | string) =>
    (typeof input === "string" ? Buffer.from(input) : input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Builds a signed_request exactly as Facebook does. */
function signed(payload: Record<string, unknown>, secret = SECRET) {
    const body = b64url(JSON.stringify(payload));
    const sig = b64url(crypto.createHmac("sha256", secret).update(body).digest());
    return `${sig}.${body}`;
}

describe("parseFacebookSignedRequest", () => {
    it("returns the payload of a correctly signed request", () => {
        const request = signed({ algorithm: "HMAC-SHA256", user_id: "1234567890", issued_at: 1 });
        expect(parseFacebookSignedRequest(request, SECRET)?.user_id).toBe("1234567890");
    });

    it("rejects a request signed with another secret", () => {
        const request = signed({ algorithm: "HMAC-SHA256", user_id: "1" }, "someone-else");
        expect(parseFacebookSignedRequest(request, SECRET)).toBeNull();
    });

    it("rejects a payload altered after signing", () => {
        const [sig] = signed({ algorithm: "HMAC-SHA256", user_id: "1" }).split(".");
        const forged = `${sig}.${b64url(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "2" }))}`;
        expect(parseFacebookSignedRequest(forged, SECRET)).toBeNull();
    });

    it("rejects any algorithm other than HMAC-SHA256", () => {
        expect(parseFacebookSignedRequest(signed({ algorithm: "none", user_id: "1" }), SECRET)).toBeNull();
    });

    it.each([undefined, "", "no-dot", ".", "abc.def"])("rejects malformed input %p", (input) => {
        expect(parseFacebookSignedRequest(input as string, SECRET)).toBeNull();
    });

    it("refuses everything when no app secret is configured", () => {
        const request = signed({ algorithm: "HMAC-SHA256", user_id: "1" }, "");
        expect(parseFacebookSignedRequest(request, "")).toBeNull();
    });
});
