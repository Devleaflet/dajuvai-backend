import { describe, expect, it, vi } from "vitest";

const query = vi.hoisted(() => vi.fn());
vi.mock("../config/db.config", () => ({ default: { query } }));

import { healthCheck } from "./health.routes";

function fakeResponse() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    res.set = vi.fn(() => res);
    return res;
}

// QA BUG-001: there was no cheap liveness/readiness endpoint for deploy checks.
describe("GET /api/health", () => {
    it("is 200 when the database answers", async () => {
        query.mockResolvedValueOnce([{ "?column?": 1 }]);
        const res = fakeResponse();

        await healthCheck({} as any, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ status: "ok", database: "up" });
    });

    it("is 503 when the database does not, without leaking the error", async () => {
        query.mockRejectedValueOnce(new Error("connect ECONNREFUSED 10.0.0.5:5432"));
        const res = fakeResponse();

        await healthCheck({} as any, res);

        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({ status: "unavailable", database: "down" });
    });
});
