import { describe, expect, it, vi } from "vitest";
import { OrderService } from "./order.service";

/**
 * The vendor status timeline loads `changedBy` as a relation. It once sent the
 * whole user row, so any vendor on an order could read the admin's or rider's
 * password hash and reset codes.
 */
describe("OrderService status history", () => {
    it("never returns credentials of the user who changed the status", async () => {
        const service = Object.create(OrderService.prototype) as any;
        service.orderStatusHistoryRepository = {
            find: vi.fn().mockResolvedValue([
                {
                    id: 1,
                    orderId: 9,
                    newStatus: "CONFIRMED",
                    changedBy: {
                        id: 4,
                        fullName: "Admin",
                        username: "admin",
                        email: "a@example.com",
                        role: "admin",
                        password: "$2b$hash",
                        resetToken: "r",
                        verificationCode: "v",
                    },
                },
                { id: 2, orderId: 9, newStatus: "DELIVERED", changedBy: null },
            ]),
        };

        const [first, second] = await service.getOrderStatusHistory(9);

        expect(first.changedBy).toEqual({
            id: 4,
            fullName: "Admin",
            username: "admin",
            email: "a@example.com",
            role: "admin",
        });
        expect(second.changedBy).toBeNull();
    });

    // QA BUG-025: an admin's internal note ("never sent to the customer") and
    // staff email addresses reached every vendor on the order.
    it("gives vendors the status, role and customer-facing reason only", async () => {
        const service = Object.create(OrderService.prototype) as any;
        service.orderItemRepository = { exists: vi.fn().mockResolvedValue(true) };
        service.orderStatusHistoryRepository = {
            find: vi.fn().mockResolvedValue([
                {
                    id: 5,
                    orderId: 1,
                    newStatus: "DELAYED",
                    changedByRole: "ADMIN",
                    reason: "Heavy rain closed the road",
                    note: "courier ticket 4411",
                    changedBy: { id: 1, fullName: "QA Admin", email: "admin@example.com", role: "admin" },
                },
            ]),
        };

        const [row] = await service.getOrderStatusHistoryForVendor(7, 1);

        expect(row.reason).toBe("Heavy rain closed the road");
        expect(row.changedByRole).toBe("ADMIN");
        expect(row.note).toBeNull();
        expect(row.changedBy).toBeNull();
    });

    // QA BUG-026: the shopper's order page showed only "Placed · Delayed" — the
    // steps already reached and the delay reason they were emailed were lost.
    it("gives the shopper each status, the customer-facing reason only, and nothing internal", async () => {
        const service = Object.create(OrderService.prototype) as any;
        const at = (m: number) => new Date(Date.UTC(2026, 9, 29, 10, m));
        service.orderStatusHistoryRepository = {
            find: vi.fn().mockResolvedValue([
                { newStatus: "ORDER_PLACED", reason: "Order placed", note: null, createdAt: at(0), changedBy: null },
                { newStatus: "CONFIRMED", reason: null, note: null, createdAt: at(1), changedBy: null },
                { newStatus: "ARRIVED_AT_WAREHOUSE", reason: "moved by ops", note: null, createdAt: at(2), changedBy: null },
                { newStatus: "DELAYED", reason: "Heavy rain", note: "courier ticket 4411", createdAt: at(3), changedBy: { id: 1 } },
            ]),
        };

        const timeline = await service.getCustomerStatusTimeline(1);

        expect(timeline).toEqual([
            { status: "ORDER_PLACED", reason: null, at: at(0) },
            { status: "CONFIRMED", reason: null, at: at(1) },
            { status: "ARRIVED_AT_WAREHOUSE", reason: null, at: at(2) },
            { status: "DELAYED", reason: "Heavy rain", at: at(3) },
        ]);
    });
});
