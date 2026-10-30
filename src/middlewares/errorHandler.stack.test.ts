import { afterEach, describe, expect, it, vi } from "vitest";

import { APIError } from "../errors/ApiError";
import { NotFoundError } from "../errors/HttpErrors";
import { globalErrorHandler } from "./errorHandler.middleware";

/**
 * Stack traces fail closed: only an explicit "development" or "test"
 * NODE_ENV may put them in a response. A deploy that forgets NODE_ENV, or
 * sets something like "staging", must not leak internals.
 */
function capture(error: unknown) {
    const res: any = { status: vi.fn(() => res), json: vi.fn(() => res) };
    globalErrorHandler(
        error as any,
        { method: "GET", originalUrl: "/api/x" } as any,
        res,
        vi.fn() as any,
    );
    return { status: res.status.mock.calls[0]?.[0], body: res.json.mock.calls[0]?.[0] };
}

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("stack traces in error responses", () => {
    it.each(["development", "test"])("are included when NODE_ENV is %s", (env) => {
        vi.stubEnv("NODE_ENV", env);
        expect(capture(new NotFoundError("Thing")).body.stack).toBeTypeOf("string");
    });

    // Unset is the case that leaked: config defaults NODE_ENV to "development".
    it.each(["production", "staging", "", undefined])("are omitted when NODE_ENV is %j", (env) => {
        vi.stubEnv("NODE_ENV", env);
        expect(capture(new NotFoundError("Thing")).body).not.toHaveProperty("stack");
    });

    it("hides a programmer error behind an opaque 500 for an unknown NODE_ENV", () => {
        vi.stubEnv("NODE_ENV", "staging");
        const { status, body } = capture(new TypeError("cannot read x of undefined"));
        expect(status).toBe(500);
        expect(body).toEqual({
            success: false,
            errorCode: "INTERNAL_ERROR",
            message: "Internal server error",
        });
    });
});

describe("error details", () => {
    it("sends an error's structured details beside its message", () => {
        const { status, body } = capture(new APIError(409, "Sold out", "INSUFFICIENT_STOCK", true, { items: [{ productId: 1 }] }));
        expect(status).toBe(409);
        expect(body).toMatchObject({ errorCode: "INSUFFICIENT_STOCK", details: { items: [{ productId: 1 }] } });
    });
});
