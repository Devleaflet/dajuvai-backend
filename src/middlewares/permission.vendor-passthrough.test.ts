import { describe, expect, it, vi } from "vitest";

import { ModuleName, PermissionLevel } from "../entities/permission.enum";
import { UserRole } from "../entities/user.entity";
import { checkPermissionUnlessVendor } from "./permission.middleware";

/**
 * Archiving, restoring and listing archived products sit behind
 * `combinedAuthMiddleware`, so the caller is either a staff/admin user or a
 * vendor. Those routes carried no module check at all, which let a staff
 * member holding only PRODUCT:VIEW delete products. Adding plain
 * `checkPermission` would have answered 401 to every vendor, since a vendor
 * token sets `req.vendor` and no `req.user`.
 */
const guard = checkPermissionUnlessVendor(ModuleName.PRODUCT, PermissionLevel.DELETE);

async function run(req: Record<string, unknown>) {
  const next = vi.fn();
  await guard(req as any, {} as any, next as any);
  return next.mock.calls[0]?.[0];
}

describe("checkPermissionUnlessVendor", () => {
  it("passes a vendor through untouched", async () => {
    expect(await run({ vendor: { id: 4 } })).toBeUndefined();
  });

  it("passes an admin through", async () => {
    expect(await run({ user: { id: 1, role: UserRole.ADMIN } })).toBeUndefined();
  });

  it("rejects a caller with neither identity", async () => {
    const error = await run({});

    expect(error).toBeDefined();
    expect((error as { status?: number }).status).toBe(401);
  });

  it("checks the module for a staff caller rather than waving them through", async () => {
    // No StaffPermission row exists for this id in the test database, so the
    // staff branch must refuse. The point is that staff reach the check at
    // all — before this guard they did not.
    const error = await run({ user: { id: 99, role: UserRole.STAFF } });

    expect(error).toBeDefined();
  });
});
