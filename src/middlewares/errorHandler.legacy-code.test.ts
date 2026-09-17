import { describe, expect, it, vi } from "vitest";

import { APIError as LegacyAPIError } from "../utils/ApiError.utils";
import { globalErrorHandler } from "./errorHandler.middleware";

/**
 * Legacy errors must keep the code they were thrown with.
 *
 * `normalizeError` used to stamp every legacy `APIError` with
 * "LEGACY_API_ERROR", which meant the codes the OpenAPI spec advertises —
 * INVALID_CURRENT_PASSWORD, INVALID_EMAIL, UPLOAD_NO_FILES — never reached a
 * client. The vendor console needs that one specifically: it decides whether a
 * failed account deletion is a wrong password, which belongs on the password
 * field, or something else, which belongs in a toast.
 */
function capture(error: unknown) {
    const res: any = { status: vi.fn(() => res), json: vi.fn(() => res) };
    globalErrorHandler(
        error as any,
        { method: "DELETE", originalUrl: "/api/vendors/me" } as any,
        res,
        vi.fn() as any,
    );
    return { status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0] };
}

describe("legacy error codes", () => {
    it("keeps a code the thrower chose", () => {
        const { status, body } = capture(
            new LegacyAPIError(400, "Current password is incorrect", "INVALID_CURRENT_PASSWORD"),
        );

        expect(status).toBe(400);
        expect(body).toMatchObject({
            success: false,
            errorCode: "INVALID_CURRENT_PASSWORD",
            message: "Current password is incorrect",
        });
    });

    it("falls back for a legacy error that chose no code", () => {
        // `GENERIC_ERROR` is the legacy constructor's default, so it says no
        // more than the fallback does and should not be mistaken for a choice.
        const { body } = capture(new LegacyAPIError(404, "Promo code not found"));

        expect(body.errorCode).toBe("LEGACY_API_ERROR");
    });

    it("still reports the status the thrower chose, not a 500", () => {
        const { status } = capture(new LegacyAPIError(409, "Already cancelled", "ITEM_CANCELLED"));

        expect(status).toBe(409);
    });
});
