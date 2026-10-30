import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * QA BUG-034: a password change and a scheduled account deletion each send
 * the account holder a security email, and a mail failure never fails the
 * action itself.
 */
const sendMail = vi.hoisted(() => vi.fn());
const repo = vi.hoisted(() => {
    const manager = {
        findOne: vi.fn(),
        save: vi.fn(async (entity: unknown) => entity),
        transaction: vi.fn(async (work: (m: unknown) => unknown) => work(manager)),
    };
    return {
        manager,
        findOne: vi.fn(),
        findOneBy: vi.fn(),
        save: vi.fn(async (entity: unknown) => entity),
    };
});

vi.mock("nodemailer", () => ({
    default: { createTransport: () => ({ use: vi.fn(), sendMail }) },
}));
vi.mock("../config/db.config", () => ({ default: { getRepository: () => repo } }));
vi.mock("../service/audit.service", () => ({ auditService: { record: vi.fn() } }));
vi.mock("../service/password-change.service", () => ({
    applyPasswordChange: vi.fn(async () => undefined),
    assertCurrentPassword: vi.fn(async () => undefined),
}));

import config from "../config/env.config";
import { AuthProvider, UserRole } from "../entities/user.entity";
import { UserDeletionService } from "../service/user-deletion.service";
import { UserController } from "./user.controller";
import { VendorController } from "./vendor.controller";

function fakeResponse() {
    const res: any = {};
    res.status = vi.fn(() => res);
    res.json = vi.fn(() => res);
    res.cookie = vi.fn(() => res);
    return res;
}

const customer = () => ({
    id: 7,
    email: "asha@example.com",
    fullName: "Asha",
    role: UserRole.USER,
    provider: AuthProvider.LOCAL,
});

beforeEach(() => {
    vi.clearAllMocks();
    sendMail.mockResolvedValue({ messageId: "m1" });
    config.USER_EMAIL = "no-reply@dajuvai.test";
    config.PASS_EMAIL = "app-password";
});

describe("password changed email", () => {
    it("goes to the customer after a password change", async () => {
        const res = fakeResponse();
        await new UserController().changePassword(
            { user: customer(), body: { currentPassword: "old", newPassword: "N3w-password" } } as any,
            res,
        );

        expect(res.status).toHaveBeenCalledWith(200);
        await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1));
        expect(sendMail.mock.calls[0][0]).toMatchObject({
            to: "asha@example.com",
            subject: "Your DajuVai password was changed",
        });
    });

    it("goes to the vendor after a vendor password change", async () => {
        const res = fakeResponse();
        await new VendorController().changePassword(
            {
                vendor: { id: 3, email: "shop@example.com", businessName: "Shop" },
                body: { currentPassword: "old", newPassword: "N3w-password" },
            } as any,
            res,
        );

        expect(res.status).toHaveBeenCalledWith(200);
        await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1));
        expect(sendMail.mock.calls[0][0]).toMatchObject({
            to: "shop@example.com",
            subject: "Your DajuVai password was changed",
        });
    });

    it("does not fail the password change when the mailer fails", async () => {
        sendMail.mockRejectedValue(new Error("SMTP down"));
        const res = fakeResponse();
        await new UserController().changePassword(
            { user: customer(), body: { currentPassword: "old", newPassword: "N3w-password" } } as any,
            res,
        );

        await vi.waitFor(() => expect(sendMail).toHaveBeenCalled());
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json.mock.calls[0][0]).toMatchObject({ success: true });
    });
});

describe("account deletion scheduled email", () => {
    const googleCustomer = () => ({ ...customer(), provider: AuthProvider.GOOGLE });

    it("tells the customer the date and how to cancel", async () => {
        repo.findOne.mockResolvedValue(googleCustomer());
        repo.manager.findOne.mockResolvedValue(googleCustomer());

        const scheduledFor = await new UserDeletionService().requestAccountDeletion(7, "asha@example.com");

        await vi.waitFor(() => expect(sendMail).toHaveBeenCalledTimes(1));
        const mail = sendMail.mock.calls[0][0];
        expect(mail).toMatchObject({
            to: "asha@example.com",
            subject: "Your DajuVai account is scheduled for deletion",
        });
        expect(mail.html).toContain(scheduledFor.toLocaleDateString("en-CA"));
        expect(mail.html).toMatch(/sign in/i);
    });

    it("does not resend for a request that is already pending", async () => {
        repo.findOne.mockResolvedValue({ ...googleCustomer(), deletionScheduledFor: new Date() });

        await new UserDeletionService().requestAccountDeletion(7, "asha@example.com");

        expect(sendMail).not.toHaveBeenCalled();
    });

    it("still schedules the deletion when the mailer fails", async () => {
        sendMail.mockRejectedValue(new Error("SMTP down"));
        repo.findOne.mockResolvedValue(googleCustomer());
        repo.manager.findOne.mockResolvedValue(googleCustomer());

        const scheduledFor = await new UserDeletionService().requestAccountDeletion(7, "asha@example.com");

        expect(scheduledFor).toBeInstanceOf(Date);
        await vi.waitFor(() => expect(sendMail).toHaveBeenCalled());
    });
});
