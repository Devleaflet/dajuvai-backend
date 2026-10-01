import bcrypt from "bcryptjs";
import { describe, expect, it } from "vitest";
import { assertResetCode } from "./resetCode.utils";

const inFuture = () => new Date(Date.now() + 60_000);

describe("assertResetCode", () => {
    it("accepts the right code without clearing it", async () => {
        const account = { resetToken: await bcrypt.hash("123456", 4), resetTokenExpire: inFuture() };
        await expect(assertResetCode(account, "123456")).resolves.toBeUndefined();
        expect(account.resetToken).not.toBeNull();
    });

    it("rejects a wrong code with 400", async () => {
        const account = { resetToken: await bcrypt.hash("123456", 4), resetTokenExpire: inFuture() };
        await expect(assertResetCode(account, "654321")).rejects.toMatchObject({ status: 400 });
    });

    it("rejects the stored hash itself", async () => {
        const hash = await bcrypt.hash("123456", 4);
        await expect(
            assertResetCode({ resetToken: hash, resetTokenExpire: inFuture() }, hash),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("rejects an expired or spent code with 410", async () => {
        const hash = await bcrypt.hash("123456", 4);
        await expect(
            assertResetCode({ resetToken: hash, resetTokenExpire: new Date(Date.now() - 1) }, "123456"),
        ).rejects.toMatchObject({ status: 410 });
        await expect(
            assertResetCode({ resetToken: null, resetTokenExpire: null }, "123456"),
        ).rejects.toMatchObject({ status: 410 });
    });
});
