import { describe, expect, it, vi } from "vitest";
import { anonymousUploadLimiter } from "./image.routes";

/**
 * `folder=vendor` bypasses authentication so signup can upload documents
 * before an account exists. Without a limiter that carve-out is an open,
 * unauthenticated write path to the project's Cloudinary account.
 *
 * express-rate-limit v7's factory returns a plain `RequestHandler` (with
 * `resetKey`/`getKey` attached, not an options object), so there is no
 * `.skip` property to assert on from the outside. Instead we invoke the
 * middleware directly with a fake req/res/next and assert on its real
 * contract: an authenticated caller is not counted against the anonymous
 * limit, observed via `next()` being called cleanly and via the
 * `X-RateLimit-Remaining` header the library writes for counted requests.
 */
describe("anonymousUploadLimiter", () => {
  it("is a callable middleware", () => {
    expect(anonymousUploadLimiter).toBeTypeOf("function");
  });

  it("skips callers who are already authenticated", async () => {
    const req: any = {
      ip: "10.0.0.1",
      app: { get: () => false },
      headers: {},
      user: { id: 1 },
    };
    const res: any = { headersSent: false, setHeader: vi.fn() };
    const next = vi.fn();

    await (anonymousUploadLimiter as any)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    // skip short-circuits before a hit is recorded or a header is written
    expect(res.setHeader).not.toHaveBeenCalled();
  });

  it("counts an anonymous caller and reports remaining quota via headers", async () => {
    const req: any = {
      ip: "10.0.0.2",
      app: { get: () => false },
      headers: {},
    };
    const res: any = { headersSent: false, setHeader: vi.fn() };
    const next = vi.fn();

    await (anonymousUploadLimiter as any)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(res.setHeader).toHaveBeenCalledWith("X-RateLimit-Remaining", expect.any(String));
  });
});
