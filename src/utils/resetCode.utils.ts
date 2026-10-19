import bcrypt from "bcryptjs";

import { APIError } from "../errors";
import { AUTH_MESSAGES, burnPasswordCheck, INVALID_CODE } from "./authPrivacy.utils";

/** Anything that can hold a hashed password-reset code: users and vendors. */
export interface ResetCodeHolder {
    resetToken?: string | null;
    resetTokenExpire?: Date | null;
}

/**
 * Checks an emailed reset code without consuming it.
 *
 * Every failure — no code requested, code expired, wrong code — is the same
 * 400 with the same message, in the same time. They used to differ (410 "no
 * longer valid", 410 "expired", 400 "incorrect"), and since an unknown email
 * also fails, a 410 told anyone that the address had an account with a reset
 * in progress. The shopper loses nothing: the message says what to do either
 * way.
 */
export async function assertResetCode(account: ResetCodeHolder, code: string): Promise<void> {
    const live = Boolean(account.resetToken && account.resetTokenExpire && account.resetTokenExpire >= new Date());
    // Only a bcrypt comparison: an equality check also accepted the stored
    // hash itself as a valid code.
    const matches = live ? await bcrypt.compare(code, account.resetToken!) : (await burnPasswordCheck(code), false);
    if (!matches) throw new APIError(400, AUTH_MESSAGES.invalidCode, INVALID_CODE);
}
