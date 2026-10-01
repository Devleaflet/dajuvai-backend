import bcrypt from "bcryptjs";
import { BadRequestError, GoneError } from "../errors/HttpErrors";

type ResetCodeHolder = {
    resetToken?: string | null;
    resetTokenExpire?: Date | null;
};

/**
 * The one check behind both halves of a password reset: confirming the
 * emailed code on its own (`/reset-password/verify`) and spending it on a new
 * password (`/reset-password`). Customers and vendors share it so the two
 * flows cannot drift into accepting different codes or saying different things.
 *
 * Checking does not consume the code; only a successful reset clears it.
 */
export async function assertResetCode(
    account: ResetCodeHolder,
    code: string,
): Promise<void> {
    if (!account.resetToken || !account.resetTokenExpire) {
        throw new GoneError(
            "This reset code is no longer valid. Request a new one.",
        );
    }
    if (account.resetTokenExpire < new Date()) {
        throw new GoneError("This reset code has expired. Request a new one.");
    }
    // Only the bcrypt comparison: an equality check also accepted the stored
    // hash itself as a valid code.
    if (!(await bcrypt.compare(code, account.resetToken))) {
        throw new BadRequestError(
            "That code is incorrect. Check the email and try again.",
        );
    }
}
