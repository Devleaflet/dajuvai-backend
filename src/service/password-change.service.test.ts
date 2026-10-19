import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";

import { applyPasswordChange, sessionCutoff } from "./password-change.service";
import { isIssuedBeforeCutoff } from "./token-revocation.service";

const account = async (password = "Old@Pass1") => ({
    password: await bcrypt.hash(password, 4),
    resetToken: null as string | null,
    resetTokenExpire: null as Date | null,
    tokensValidFrom: null as Date | null,
});

describe("applyPasswordChange", () => {
    it("changes the password with the right current password", async () => {
        const acc = await account();
        await applyPasswordChange(acc, { currentPassword: "Old@Pass1", newPassword: "New@Pass2" });
        expect(await bcrypt.compare("New@Pass2", acc.password!)).toBe(true);
        expect(acc.tokensValidFrom).toBeInstanceOf(Date);
    });

    it("refuses a wrong current password without touching the account", async () => {
        const acc = await account();
        const before = acc.password;
        await expect(
            applyPasswordChange(acc, { currentPassword: "nope", newPassword: "New@Pass2" }),
        ).rejects.toMatchObject({ status: 400, errorCode: "INVALID_CURRENT_PASSWORD" });
        expect(acc.password).toBe(before);
        expect(acc.tokensValidFrom).toBeNull();
    });

    it("refuses reusing the current password", async () => {
        const acc = await account();
        await expect(
            applyPasswordChange(acc, { currentPassword: "Old@Pass1", newPassword: "Old@Pass1" }),
        ).rejects.toMatchObject({ errorCode: "PASSWORD_UNCHANGED" });
    });

    it("accepts an emailed code instead, and uses it up", async () => {
        const acc = await account();
        acc.resetToken = await bcrypt.hash("123456", 4);
        acc.resetTokenExpire = new Date(Date.now() + 60_000);
        await applyPasswordChange(acc, { token: "123456", newPassword: "New@Pass2" });
        expect(acc.resetToken).toBeNull();
        await expect(
            applyPasswordChange(acc, { token: "123456", newPassword: "Other@Pass3" }),
        ).rejects.toMatchObject({ status: 400, errorCode: "INVALID_CODE" });
    });
});

describe("sessionCutoff", () => {
    it("revokes tokens from earlier seconds but not one signed right after", () => {
        const now = Date.parse("2026-10-14T10:00:00.400Z");
        const cutoff = sessionCutoff(now);
        const nowSeconds = Math.floor(now / 1000);
        expect(isIssuedBeforeCutoff(nowSeconds, cutoff)).toBe(false);
        expect(isIssuedBeforeCutoff(nowSeconds - 1, cutoff)).toBe(true);
    });
});
