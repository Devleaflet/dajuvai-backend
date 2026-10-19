import bcrypt from "bcryptjs";
import { randomInt } from "crypto";

import { appUrl, button, emailLayout, notice, paragraph } from "./emailLayout.utils";
import { isEmailConfigured, transporter, FROM } from "./nodemailer.utils";

/**
 * Account-enumeration defence for the public auth endpoints.
 *
 * Anyone can type an email into a login, signup, "forgot password" or
 * "resend code" form. Each of those used to answer differently depending on
 * whether the address was registered and as which kind of account ("This
 * email belongs to a customer account"), which let anyone learn who has an
 * account here and what role it has. OWASP's guidance — and what this module
 * enforces — is that an unauthenticated caller gets the same message, the
 * same HTTP status, the same response shape and roughly the same response time
 * whatever the account state. Details are given only once ownership is proven
 * (a correct password, or a code from the inbox).
 *
 * Every endpoint that touches an unknown email uses these strings verbatim, so
 * clients can rely on them and tests can pin them.
 */
export const AUTH_MESSAGES = {
    /** Vendor login: unknown email, customer email, wrong password, closed account. */
    invalidVendorLogin: "Incorrect email or password. Please try again.",
    /**
     * Customer login: the same cases, plus accounts that sign in with Google or
     * Facebook. Pointing at the other options is in every failure, so it
     * reveals nothing about this particular address.
     */
    invalidCustomerLogin:
        "Incorrect email or password. Please try again, or continue with Google or Facebook if that is how you signed up.",
    /** Forgot password, whatever the email. */
    resetRequested:
        "Check your email. If an account can be reset with this address, we've sent a 6-digit code. It expires in 15 minutes.",
    /** A reset or verification code that is wrong, expired, spent or for an unknown email. */
    invalidCode: "This code is incorrect or has expired. Check the latest code we sent, or request a new one.",
    /** Resend verification code, whatever the email. */
    verificationRequested: "Check your email. If this address still needs verifying, we've sent a new 6-digit code.",
    /** Customer signup, whatever the email. */
    customerSignupReceived: "Check your email. Follow the instructions we sent to finish setting up your account.",
    /** Public vendor signup, whatever the email. */
    vendorSignupReceived:
        "Application received. Check your email for the next steps. Our team reviews every application within 5 business days.",
} as const;

/** `errorCode` for every failed public login, whoever the email belongs to. */
export const INVALID_CREDENTIALS = "INVALID_CREDENTIALS";
/** `errorCode` for every failed code check. */
export const INVALID_CODE = "INVALID_CODE";

/**
 * A real bcrypt hash of a value nobody knows, at the same cost as stored
 * passwords. Comparing against it costs what a real comparison costs.
 */
const DUMMY_HASH = bcrypt.hashSync(`dummy:${Math.random()}:${Date.now()}`, 10);

/**
 * Spends the time a password check would take. Call it on every login path
 * that fails *before* a real comparison (no such account, wrong account type),
 * or the response time tells an attacker the email is unknown.
 */
export async function burnPasswordCheck(password: string): Promise<void> {
    await bcrypt.compare(password, DUMMY_HASH);
}

/**
 * Spends the time issuing a reset or verification code would take, for the
 * paths that do not issue one. The DB write and email are not mirrored: the
 * write is a few milliseconds and the email is sent in the background.
 */
export async function burnCodeIssue(): Promise<void> {
    // Same work as the controllers' TokenUtils: a 6-digit CSPRNG code, bcrypt at cost 10.
    await bcrypt.hash(randomInt(100000, 1000000).toString(), 10);
}

/**
 * Tells the owner of an email that someone tried to create an account with it.
 *
 * This is what lets signup answer every attempt with the same message without
 * stranding a legitimate user who forgot they already had an account: the
 * owner gets a way back in, and nobody else learns the address is registered.
 * Fire-and-forget, like every other auth email.
 */
export function sendExistingAccountEmailInBackground(
    to: string,
    kind: "customer" | "vendor",
    attempted: "customer" | "vendor",
): void {
    if (!isEmailConfigured()) return;

    const signIn = kind === "vendor" ? appUrl("/vendor/login") : appUrl("/login");
    const reset = kind === "vendor" ? appUrl("/vendor/forgot-password") : appUrl("/forgot-password");
    const accountName = kind === "vendor" ? "vendor account" : "DajuVai account";
    const html = emailLayout({
        preheader: `Someone tried to create a new account with this email. You already have a ${accountName}.`,
        eyebrow: "Account security",
        title: "You already have an account",
        html: [
            paragraph(
                `Someone — hopefully you — just tried to create a new ${attempted === "vendor" ? "vendor" : "customer"} account with this email address. This address already has a ${accountName}, so no new account was created.`,
            ),
            notice("If this was you, sign in to your existing account, or reset your password if you have forgotten it.", "info"),
            button("Sign in", signIn),
            paragraph(`Forgot your password? <a href="${reset}">Reset it here</a>.`),
            paragraph("If this wasn't you, you can ignore this email. Your account has not been changed."),
        ].join(""),
        footerNote: "You are receiving this because someone entered your email address on a DajuVai sign-up form.",
    });

    void transporter
        .sendMail({ from: FROM(), to, subject: "You already have a DajuVai account", html })
        .catch((error: unknown) => console.error('"Existing account" email failed:', error));
}
