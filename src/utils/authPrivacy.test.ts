import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Account enumeration: the public auth endpoints must answer the same way for
 * an unknown email, a customer's, a vendor's and a social account's. These
 * pin the two controllers' answers through their real handlers, with storage
 * and email mocked.
 */

const db = vi.hoisted(() => ({
    users: new Map<string, any>(),
    vendors: new Map<string, any>(),
    sent: [] as string[],
}));

vi.mock("../service/user.service", async (orig) => ({
    ...(await orig<any>()),
    findUserByEmail: vi.fn(async (email: string) => db.users.get(email) ?? null),
    findUserByEmailLogin: vi.fn(async (email: string) => db.users.get(email) ?? null),
    saveUser: vi.fn(async (u: any) => u),
    createUser: vi.fn(async (u: any) => u),
}));
vi.mock("./nodemailer.utils", async (orig) => ({
    ...(await orig<any>()),
    isEmailConfigured: () => false,
    sendVerificationEmailInBackground: (to: string, sub: string) => db.sent.push(`${sub}:${to}`),
}));

import bcrypt from "bcryptjs";
import { AuthProvider } from "../entities/user.entity";
import { AUTH_MESSAGES } from "./authPrivacy.utils";
import { assertResetCode } from "./resetCode.utils";
import { UserController } from "../controllers/user.controller";
import { VendorController } from "../controllers/vendor.controller";

function response() {
    const res: any = { statusCode: 0, body: undefined };
    res.status = (code: number) => ((res.statusCode = code), res);
    res.json = (body: unknown) => ((res.body = body), res);
    res.cookie = () => res;
    return res;
}

/** Runs a handler and returns what the client would see, thrown or sent. */
async function call(handler: (req: any, res: any) => Promise<unknown>, body: unknown) {
    const res = response();
    try {
        await handler({ body, query: {}, cookies: {} }, res);
        return { status: res.statusCode, body: res.body };
    } catch (error: any) {
        return { status: error.status, body: { message: error.message, errorCode: error.errorCode } };
    }
}

const users = Object.create(UserController.prototype) as any;
users.toLowerEmail = (e: string) => e.trim().toLowerCase();
users.vendorService = { findVendorForSignup: async (e: string) => db.vendors.get(e) ?? null };

const vendors = Object.create(VendorController.prototype) as any;
vendors.vendorService = {
    findVendorByEmail: async (e: string) => db.vendors.get(e) ?? null,
    findVendorByEmailLogin: async (e: string) => db.vendors.get(e) ?? null,
    saveVendor: async (v: any) => v,
};

beforeEach(async () => {
    db.users.clear();
    db.vendors.clear();
    db.sent.length = 0;
    const hash = await bcrypt.hash("Right#Pass1", 4);
    db.users.set("shopper@example.com", { id: 1, email: "shopper@example.com", provider: AuthProvider.LOCAL, password: hash, isVerified: true });
    db.users.set("google@example.com", { id: 2, email: "google@example.com", provider: AuthProvider.GOOGLE, password: null, isVerified: true });
    db.vendors.set("seller@example.com", { id: 3, email: "seller@example.com", password: hash, isApproved: true });
});

const emails = ["nobody@example.com", "shopper@example.com", "google@example.com", "seller@example.com"];

describe("vendor auth reveals nothing about an email", () => {
    it("forgot password: one answer for every email, a code only for a vendor", async () => {
        const answers = await Promise.all(emails.map((email) => call(vendors.forgotPassword.bind(vendors), { email })));
        expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
        expect(answers[0]).toEqual({ status: 202, body: { success: true, message: AUTH_MESSAGES.resetRequested } });
        expect(db.sent).toEqual(["Reset Password:seller@example.com"]);
    });

    it("login: one failure for unknown, customer and wrong-password", async () => {
        const answers = await Promise.all(
            [
                { email: "nobody@example.com", password: "Right#Pass1" },
                { email: "shopper@example.com", password: "Right#Pass1" },
                { email: "seller@example.com", password: "Wrong#Pass1" },
            ].map((body) => call(vendors.login.bind(vendors), body)),
        );
        for (const answer of answers) {
            expect(answer).toEqual({ status: 401, body: { message: AUTH_MESSAGES.invalidVendorLogin, errorCode: "INVALID_CREDENTIALS" } });
        }
    });

    it("reset step: an unknown email fails exactly like a wrong code", async () => {
        const unknown = await call(vendors.verifyResetCode.bind(vendors), { email: "nobody@example.com", token: "123456" });
        const wrong = await call(vendors.verifyResetCode.bind(vendors), { email: "seller@example.com", token: "123456" });
        expect(unknown).toEqual(wrong);
        expect(unknown).toEqual({ status: 400, body: { message: AUTH_MESSAGES.invalidCode, errorCode: "INVALID_CODE" } });
    });
});

describe("customer auth reveals nothing about an email", () => {
    it("forgot password: one answer for every email, a code only for a password account", async () => {
        const answers = await Promise.all(emails.map((email) => call(users.forgotPassword.bind(users), { email })));
        expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
        expect(db.sent).toEqual(["Reset Password:shopper@example.com"]);
    });

    it("login: one failure for unknown, vendor, social and wrong-password", async () => {
        const answers = await Promise.all(
            [
                { email: "nobody@example.com", password: "Right#Pass1" },
                { email: "seller@example.com", password: "Right#Pass1" },
                { email: "google@example.com", password: "Right#Pass1" },
                { email: "shopper@example.com", password: "Wrong#Pass1" },
            ].map((body) => call(users.login.bind(users), body)),
        );
        expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1);
        expect(answers[0].status).toBe(401);
        expect(answers[0].body.message).toBe(AUTH_MESSAGES.invalidCustomerLogin);
    });
});

describe("assertResetCode", () => {
    it("fails the same way with no code, an expired code and a wrong code", async () => {
        const hash = await bcrypt.hash("123456", 4);
        const cases = [
            {},
            { resetToken: hash, resetTokenExpire: new Date(Date.now() - 1000) },
            { resetToken: hash, resetTokenExpire: new Date(Date.now() + 60_000) },
        ];
        const errors = await Promise.all(cases.map((c) => assertResetCode(c, "654321").catch((e) => [e.status, e.message])));
        expect(new Set(errors.map((e) => JSON.stringify(e))).size).toBe(1);
        await expect(assertResetCode(cases[2], "123456")).resolves.toBeUndefined();
    });
});
