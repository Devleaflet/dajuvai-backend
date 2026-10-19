import { describe, expect, it } from "vitest";

import { searchEventSchema } from "./search-event.schema";

const valid = {
  q: "headphones",
  outcome: "CLICK",
  targetType: "PRODUCT",
  targetId: 42,
};

describe("searchEventSchema", () => {
  it("accepts a well-formed event", () => {
    expect(searchEventSchema.parse(valid)).toEqual(valid);
  });

  it("coerces the id a JSON body may send as a string", () => {
    expect(searchEventSchema.parse({ ...valid, targetId: "42" }).targetId).toBe(42);
  });

  it.each(["", "a", "  ", "!!", "-"])("rejects an unsearchable query %j", (q) => {
    expect(searchEventSchema.safeParse({ ...valid, q }).success).toBe(false);
  });

  it("rejects an outcome it does not define", () => {
    // The endpoint is unauthenticated: anything it accepts is a value an
    // anonymous caller can write into the learning tables.
    expect(searchEventSchema.safeParse({ ...valid, outcome: "VIEW" }).success).toBe(false);
  });

  it("rejects a target type it does not define", () => {
    expect(
      searchEventSchema.safeParse({ ...valid, targetType: "VENDOR" }).success,
    ).toBe(false);
  });

  it.each([0, -1, 1.5, "abc"])("rejects a target id of %j", (targetId) => {
    expect(searchEventSchema.safeParse({ ...valid, targetId }).success).toBe(false);
  });

  it("caps the query length", () => {
    expect(searchEventSchema.safeParse({ ...valid, q: "x".repeat(81) }).success).toBe(
      false,
    );
  });

  it("keeps nothing the caller sends beyond the four fields", () => {
    const parsed = searchEventSchema.parse({ ...valid, userId: 7, note: "hi" });

    expect(Object.keys(parsed).sort()).toEqual([
      "outcome",
      "q",
      "targetId",
      "targetType",
    ]);
  });
});
