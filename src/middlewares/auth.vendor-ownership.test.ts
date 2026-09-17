import { describe, expect, it, vi } from "vitest";

import { UserRole } from "../entities/user.entity";
import { restrictToVendorOrAdmin } from "./auth.middleware";

/**
 * A vendor token used to pass this guard for any `:id` in the path, so any
 * signed-in vendor could edit any other vendor through
 * `PUT /api/vendors/:id`, `PUT /api/vendors/v2/:id` and
 * `PATCH /api/vendors/:vendorId/payment-options/:paymentOptionId` — bank and
 * wallet details included. The guard now compares the token's vendor against
 * the vendor being addressed.
 */
async function run(req: Record<string, unknown>) {
  const next = vi.fn();
  await restrictToVendorOrAdmin(req as any, {} as any, next as any);
  return next.mock.calls[0]?.[0];
}

describe("restrictToVendorOrAdmin", () => {
  it("lets a vendor change their own account", async () => {
    expect(await run({ vendor: { id: 7 }, params: { id: "7" } })).toBeUndefined();
  });

  it("refuses a vendor editing a different vendor", async () => {
    const error = await run({ vendor: { id: 7 }, params: { id: "8" } });

    expect(error).toBeDefined();
    expect((error as Error).message).toMatch(/their own account/);
  });

  it("refuses a vendor editing another vendor's payment option", async () => {
    const error = await run({
      vendor: { id: 7 },
      params: { vendorId: "8", paymentOptionId: "3" },
    });

    expect(error).toBeDefined();
  });

  it("refuses a vendor when the path carries no vendor id", async () => {
    expect(await run({ vendor: { id: 7 }, params: {} })).toBeDefined();
  });

  it("still lets an admin through for any vendor", async () => {
    expect(
      await run({ user: { role: UserRole.ADMIN }, params: { id: "8" } }),
    ).toBeUndefined();
  });

  it("refuses an ordinary user", async () => {
    expect(await run({ user: { role: UserRole.USER }, params: { id: "8" } })).toBeDefined();
  });

  it("refuses an unauthenticated request", async () => {
    const error = await run({ params: { id: "8" } });

    expect((error as Error).message).toMatch(/Authentication required/);
  });
});
