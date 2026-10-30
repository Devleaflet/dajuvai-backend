import { describe, expect, it, vi } from "vitest";

vi.mock("../config/db.config", () => ({
    default: { getRepository: () => ({ find: vi.fn().mockResolvedValue([]) }) },
}));
vi.mock("../utils/nodemailer.utils", async (importOriginal) => ({
    ...(await importOriginal<object>()),
    sendCustomerOrderEmail: vi.fn(),
    sendVendorOrderEmail: vi.fn(),
}));

import { OrderService } from "./order.service";

/**
 * QA BUG-027: an order paid online (eSewa / NPX) mailed the customer and the
 * vendors, but never the admin inbox a COD order reaches.
 */
describe("sendOrderEmails (orders paid online)", () => {
    it("tells the admins about the order, as a cash-on-delivery order does", async () => {
        const service = Object.create(OrderService.prototype) as any;
        service.orderRepository = {
            findOne: vi.fn().mockResolvedValue({
                id: 2,
                orderNumber: "DJV-TEST",
                isBuyNow: true,
                orderItems: [],
                orderedBy: { id: 3, email: "c@example.com", address: { district: "Kathmandu" } },
            }),
        };
        service.sendAdminOrderPlacedEmail = vi.fn().mockResolvedValue(undefined);

        await service.sendOrderEmails(2);

        expect(service.sendAdminOrderPlacedEmail).toHaveBeenCalledWith(2);
    });
});
