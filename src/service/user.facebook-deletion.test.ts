import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted with vi.mock: user.service reads its repositories at import time.
const { findOne, save, remove } = vi.hoisted(() => ({
    findOne: vi.fn(),
    save: vi.fn(async (user: Record<string, any>) => user),
    remove: vi.fn(),
}));

vi.mock("../config/db.config", () => ({
    default: { getRepository: () => ({ findOne, save, remove }) },
}));

import { deleteUserDataByFacebookId } from "./user.service";

describe("deleteUserDataByFacebookId (Facebook data-deletion callback)", () => {
    beforeEach(() => {
        findOne.mockReset();
        save.mockClear();
        remove.mockClear();
    });

    it("schedules the normal grace-period deletion instead of deleting the row", async () => {
        findOne.mockResolvedValue({ id: 4, role: "user", deletionScheduledFor: null, deletionFinalizedAt: null });

        await deleteUserDataByFacebookId("fb-1");

        expect(remove).not.toHaveBeenCalled();
        const saved = save.mock.calls[0][0];
        expect(saved.deletionRequestedAt).toBeInstanceOf(Date);
        expect(saved.deletionScheduledFor.getTime()).toBeGreaterThan(Date.now());
    });

    it("returns only a confirmation code, never the account", async () => {
        findOne.mockResolvedValue({ id: 4, email: "a@b.c", role: "user" });

        const result = await deleteUserDataByFacebookId("fb-1");

        expect(Object.keys(result)).toEqual(["confirmationCode"]);
        expect(result.confirmationCode).toMatch(/^[a-f0-9]{16,}$/);
    });

    it("answers the same way for an unknown Facebook id", async () => {
        findOne.mockResolvedValue(null);

        const result = await deleteUserDataByFacebookId("fb-unknown");

        expect(result.confirmationCode).toMatch(/^[a-f0-9]{16,}$/);
        expect(save).not.toHaveBeenCalled();
    });

    it("never schedules a staff or admin account", async () => {
        findOne.mockResolvedValue({ id: 1, role: "admin" });

        await deleteUserDataByFacebookId("fb-admin");

        expect(save).not.toHaveBeenCalled();
        expect(remove).not.toHaveBeenCalled();
    });

    it("keeps an existing deletion deadline", async () => {
        const deadline = new Date(Date.now() + 86_400_000);
        findOne.mockResolvedValue({ id: 4, role: "user", deletionScheduledFor: deadline });

        await deleteUserDataByFacebookId("fb-1");

        expect(save).not.toHaveBeenCalled();
    });
});
