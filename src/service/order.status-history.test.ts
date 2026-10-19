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
});
