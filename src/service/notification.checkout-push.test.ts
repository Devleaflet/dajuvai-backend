import { beforeEach, describe, expect, it, vi } from "vitest";

const { getTokensForUser, getTokensForVendors, getTokensForUsers } = vi.hoisted(() => ({
    getTokensForUser: vi.fn(async () => ["shopper-phone"]),
    getTokensForVendors: vi.fn(async () => ["seller-phone"]),
    getTokensForUsers: vi.fn(async () => ["admin-phone"]),
}));
vi.mock("./deviceToken.service", () => ({
    deviceTokenService: { getTokensForUser, getTokensForVendors, getTokensForUsers, deactivateTokens: vi.fn() },
}));

import { NotificationService } from "./notification.service";

/**
 * The shopper is looking at the confirmation when their order is placed or
 * their payment settles: a push to their own phone about what they just did
 * is noise. The in-app feed still records it; sellers and admins, who did
 * not see it happen, are still pushed.
 */
function service() {
    const s = Object.create(NotificationService.prototype) as any;
    s.notificationRepo = { create: (row: unknown) => row, save: vi.fn() };
    s.userRepo = { find: vi.fn(async () => [{ id: 1 }]), findOne: vi.fn(async () => ({ id: 3 })) };
    s.orderRepo = { findOne: vi.fn(async () => ({ id: 9, orderNumber: "DJV-9" })) };
    s.vendorRepo = { find: vi.fn(async () => [{ id: 7 }]) };
    s.push = vi.fn();
    return s;
}

const pushedTo = (s: any) => s.push.mock.calls.map(([tokens]: [string[]]) => tokens).flat();

beforeEach(() => vi.clearAllMocks());

describe("checkout pushes", () => {
    it("tells sellers and admins about a new order, but not the shopper who placed it", async () => {
        const s = service();

        await s.notifyOrderPlaced({ id: 9, orderNumber: "DJV-9", orderedById: 3, orderItems: [{ vendorId: 7 }] });

        expect(pushedTo(s)).toEqual(expect.arrayContaining(["seller-phone", "admin-phone"]));
        expect(pushedTo(s)).not.toContain("shopper-phone");
        expect(s.notificationRepo.save).toHaveBeenCalledWith(
            expect.arrayContaining([expect.objectContaining({ createdById: 3 })]),
        );
    });

    it("records a settled payment in the shopper's feed without pushing it", async () => {
        const s = service();

        await s.notifyPaymentSuccess(9, 3);
        await s.notifyPaymentFailed(9, 3);

        expect(s.push).not.toHaveBeenCalled();
        expect(s.notificationRepo.save).toHaveBeenCalledTimes(2);
    });
});
