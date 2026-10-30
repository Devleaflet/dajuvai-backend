import crypto from "crypto";

export interface FacebookSignedRequest {
    algorithm: string;
    user_id: string;
    issued_at?: number;
}

const fromBase64Url = (value: string) => Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");

/**
 * Verifies a Facebook `signed_request` (`<sig>.<payload>`, both base64url) and
 * returns its payload, or null when it is not genuinely from Facebook.
 *
 * The signature is HMAC-SHA256 of the encoded payload with the app secret.
 * Without this check anyone could post any `user_id` to the data-deletion
 * callback and have that account deleted.
 */
export function parseFacebookSignedRequest(
    signedRequest: string,
    appSecret: string,
): FacebookSignedRequest | null {
    if (!appSecret || typeof signedRequest !== "string") return null;
    const [encodedSig, encodedPayload, extra] = signedRequest.split(".");
    if (!encodedSig || !encodedPayload || extra !== undefined) return null;

    const expected = crypto.createHmac("sha256", appSecret).update(encodedPayload).digest();
    const received = fromBase64Url(encodedSig);
    if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;

    try {
        const payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8"));
        if (payload?.algorithm?.toUpperCase() !== "HMAC-SHA256") return null;
        if (typeof payload.user_id !== "string" || !payload.user_id) return null;
        return payload;
    } catch {
        return null;
    }
}
