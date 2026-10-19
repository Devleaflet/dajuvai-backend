import { describe, expect, it } from "vitest";

import { promoIdParamSchema } from "./promo.zod";

/**
 * Regression cover for a 409 on every promo edit.
 *
 * `PATCH /api/promo/:id` validated only its body, so `req.params.id` reached
 * `promoRepository.save()` as the string Express produced. TypeORM reads a
 * string primary key as "not persisted yet" and issues an INSERT, which hits
 * the unique index on `promoCode` and comes back as
 * `UNIQUE_CONSTRAINT_VIOLATION` — on an edit that never touched the code.
 *
 * The coercion is therefore the fix, not a convenience, and the type of the
 * parsed value is the thing worth asserting.
 */
describe("promoIdParamSchema", () => {
    it("turns the path parameter into a number", () => {
        const parsed = promoIdParamSchema.parse({ id: "14" });

        expect(parsed.id).toBe(14);
        expect(typeof parsed.id).toBe("number");
    });

    it("rejects an id that is not a positive integer", () => {
        for (const id of ["0", "-3", "1.5", "abc", ""]) {
            expect(() => promoIdParamSchema.parse({ id })).toThrow();
        }
    });
});
