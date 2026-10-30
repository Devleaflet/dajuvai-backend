import { describe, expect, it } from "vitest";

import { createCategorySchema, updateCategorySchema } from "./category.zod";

/**
 * QA BUG-032: the storefront gate's heading comes from `minimumAge` and its
 * body from `restrictionMessage`, so a message naming another age contradicts
 * the heading ("Are you 18 or older? / You must be 21 or older").
 */
const restricted = (minimumAge: number | undefined, restrictionMessage: string) => ({
    name: "Liquor",
    isAgeRestricted: true,
    minimumAge,
    restrictionMessage,
});

const messageError = (result: ReturnType<typeof createCategorySchema.safeParse>) =>
    result.success ? undefined : result.error.errors.find((e) => e.path.join(".") === "restrictionMessage")?.message;

describe.each([
    ["create", createCategorySchema],
    ["update", updateCategorySchema],
])("%s category: restriction message vs minimum age", (_name, schema) => {
    it.each([
        "You must be 21 or older to buy alcohol.",
        "Only for 21+ customers",
        "Buyers aged 21 and over only",
        "You must be 21 years old",
        "Not for sale to anyone under 21",
        "You must be over the age of 21",
    ])("rejects %j when the minimum age is 18", (message) => {
        expect(messageError(schema.safeParse(restricted(18, message)))).toBe(
            "This message mentions age 21, but the minimum age is 18. Update the message to match.",
        );
    });

    it.each([
        "You must be 18 or older to buy alcohol.",
        "18+ only. Sold in 750ml bottles.",
        "Contains 40% alcohol, 2 bottles per order",
        "Alcohol is restricted to adults.",
    ])("accepts %j when the minimum age is 18", (message) => {
        expect(schema.safeParse(restricted(18, message)).success).toBe(true);
    });

    it("checks against the default age of 18 when none is sent", () => {
        expect(messageError(schema.safeParse(restricted(undefined, "21+ only")))).toMatch(/minimum age is 18/);
    });

    it("ignores the message when the category is not age-restricted", () => {
        expect(
            schema.safeParse({ name: "Snacks", isAgeRestricted: false, minimumAge: 18, restrictionMessage: "21+" }).success,
        ).toBe(true);
    });
});
