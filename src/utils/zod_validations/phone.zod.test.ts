import { describe, expect, it } from "vitest";

import { nepalPhoneNumberSchema } from "./phone.zod";

// QA BUG-016: the profile took any 7-15 digits and rejected +977, while
// checkout demanded exactly 10, so a saved number could fail at checkout.
describe("nepalPhoneNumberSchema", () => {
    it.each([
        ["9812345678", "9812345678"],
        ["+9779812345678", "9812345678"],
        ["9779812345678", "9812345678"],
        ["+977 981-234-5678", "9812345678"],
        [" 9812345678 ", "9812345678"],
    ])("accepts %j as %j", (input, stored) => {
        expect(nepalPhoneNumberSchema.parse(input)).toBe(stored);
    });

    it.each(["12345", "1234567", "98123456789", "98AB345678", "+1 9812345678", ""])("rejects %j", (input) => {
        expect(nepalPhoneNumberSchema.safeParse(input).success).toBe(false);
    });
});
