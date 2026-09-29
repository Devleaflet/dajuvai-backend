import { AuthProvider } from "../entities/user.entity";

/**
 * How an account actually signs in, for admin display.
 *
 * `provider` alone is not trustworthy: older Facebook sign-ups were saved with
 * the default `local` while their `facebookId` was set. The linked ids decide
 * when the column does not name a social provider. The ids themselves are
 * never returned — only this derived value is.
 */
export function deriveSignInProvider(user: {
    provider?: string | null;
    googleId?: string | null;
    facebookId?: string | null;
}): AuthProvider {
    if (user.provider === AuthProvider.GOOGLE || user.provider === AuthProvider.FACEBOOK) {
        return user.provider;
    }
    if (user.facebookId) return AuthProvider.FACEBOOK;
    if (user.googleId) return AuthProvider.GOOGLE;
    return AuthProvider.LOCAL;
}
