import { describe, expect, it, vi } from "vitest";

vi.mock("../config/db.config", () => ({ default: {} }));

import { wordConditions } from "./broadcast.search.service";

describe("wordConditions", () => {
    it("requires every word to match one of the columns", () => {
        const { sql, params } = wordConditions("ram shr", ["p.name", "p.email"], { idColumn: "p.id" });
        expect(sql).toBe("(p.name ILIKE $1 OR p.email ILIKE $1) AND (p.name ILIKE $2 OR p.email ILIKE $2)");
        expect(params).toEqual(["%ram%", "%shr%"]);
    });

    it("lets a number match the id and a phone number without punctuation", () => {
        const { sql, params } = wordConditions("9800", ["p.name"], { idColumn: "p.id", phoneColumn: "p.phone", offset: 2 });
        expect(sql).toContain("p.id::text = $4");
        expect(sql).toContain(String.raw`regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g') LIKE $5`);
        expect(params).toEqual(["%9800%", "9800", "%9800%"]);
    });

    it("treats LIKE wildcards in the query as literal text", () => {
        expect(wordConditions("50%_off", ["p.name"], { idColumn: "p.id" }).params).toEqual([String.raw`%50\%\_off%`]);
    });

    it("matches everything when the query is empty", () => {
        expect(wordConditions("   ", ["p.name"], { idColumn: "p.id" })).toEqual({ sql: "TRUE", params: [] });
    });
});
