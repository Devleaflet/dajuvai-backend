import { describe, expect, it, vi } from "vitest";

const query = vi.fn();
vi.mock("../config/db.config", () => ({ default: { query: (...args: unknown[]) => query(...args) } }));
vi.mock("../service/deviceToken.service", () => ({ deviceTokenService: {} }));
vi.mock("../socket/socket", () => ({ emitNotification: vi.fn() }));
vi.mock("../utils/fcm.utils", () => ({ sendToTokens: vi.fn() }));

import { USER_AUDIENCE_SQL, VENDOR_AUDIENCE_SQL } from "../jobs/broadcast.jobs";
import { broadcastSearchService } from "./broadcast.search.service";

// Deleting an account from the admin console anonymises it at once, without
// the grace period, so deletionRequestedAt alone does not mark it gone.
describe("broadcast audiences leave out deleted accounts", () => {
    it("when resolving who a broadcast reaches", () => {
        expect(USER_AUDIENCE_SQL).toContain(`u."deletionFinalizedAt" IS NULL`);
        expect(VENDOR_AUDIENCE_SQL).toContain(`v."deletionFinalizedAt" IS NULL`);
    });

    it.each(["user", "vendor"] as const)("when picking %s recipients", async (kind) => {
        query.mockReset();
        query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);
        await broadcastSearchService.recipients({ kind, q: "", page: 1, limit: 20 } as never);
        for (const [sql] of query.mock.calls) expect(sql).toContain(`p."deletionFinalizedAt" IS NULL`);
    });
});
