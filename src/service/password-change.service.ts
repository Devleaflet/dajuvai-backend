import bcrypt from "bcryptjs";

import { APIError } from "../errors/ApiError";
import { assertResetCode } from "../utils/resetCode.utils";

/** The columns a signed-in password change touches; users and vendors share them. */
type PasswordAccount = {
    password?: string | null;
    resetToken?: string | null;
    resetTokenExpire?: Date | null;
    tokensValidFrom?: Date | null;
};

export type PasswordChangeInput = {
    currentPassword?: string;
    /** A code emailed by forgot-password, for an account holder who forgot the current one. */
    token?: string;
    newPassword: string;
};

export async function assertCurrentPassword(
    account: PasswordAccount,
    currentPassword: string,
): Promise<void> {
    if (!account.password || !(await bcrypt.compare(currentPassword, account.password))) {
        throw new APIError(400, "Current password is incorrect", "INVALID_CURRENT_PASSWORD");
    }
}

/**
 * The cutoff that signs out every other session but not the one about to be
 * issued. `iat` has one-second resolution and `isIssuedBeforeCutoff` rejects
 * `iat * 1000 <= cutoff`, so a cutoff of "now" would also reject a token signed
 * a moment later in the same second. One millisecond before the current second
 * revokes everything older and keeps the fresh token.
 */
export function sessionCutoff(now: number = Date.now()): Date {
    return new Date(Math.floor(now / 1000) * 1000 - 1);
}

/**
 * Sets a new password on an account whose owner is signed in.
 *
 * The owner proves it with the current password, or — having forgotten it —
 * with a code sent to the account's email by forgot-password. Mutates the
 * account; the caller saves it and issues fresh tokens, since every older token
 * stops working here.
 */
export async function applyPasswordChange(
    account: PasswordAccount,
    input: PasswordChangeInput,
): Promise<void> {
    if (input.token) {
        await assertResetCode(account, input.token);
    } else {
        await assertCurrentPassword(account, input.currentPassword ?? "");
    }

    if (account.password && (await bcrypt.compare(input.newPassword, account.password))) {
        throw new APIError(
            400,
            "Choose a password different from your current one",
            "PASSWORD_UNCHANGED",
        );
    }

    account.password = await bcrypt.hash(input.newPassword, 10);
    account.resetToken = null;
    account.resetTokenExpire = null;
    account.tokensValidFrom = sessionCutoff();
}
