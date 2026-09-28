/**
 * Entity columns that must never leave the server in a JSON response.
 *
 * `User` and `Vendor` load these like any other column, so every query that
 * joins an author, customer or vendor and returns the row unsanitised ships
 * the password hash and reset token with it — `GET /api/banners/:id` and
 * `GET /api/deal/:id` both did, publicly. Sanitising each response by hand
 * fails the first time someone adds a join and forgets; this is applied to
 * every `res.json()` as Express's `json replacer`, so it cannot be forgotten.
 *
 * Exact key names only. The login response legitimately carries a `token`,
 * so nothing broader than these columns is stripped.
 */
const NEVER_SERIALIZED = new Set([
    "password",
    "resetToken",
    "resetTokenExpire",
    "verificationCode",
    "verificationCodeExpire",
    "fcmToken",
    "tokensValidFrom",
]);

export function redactEntitySecrets(key: string, value: unknown): unknown {
    return NEVER_SERIALIZED.has(key) ? undefined : value;
}
