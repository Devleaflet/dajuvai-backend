import { describe, expect, it, vi } from "vitest";

const sent: Array<{ html: string; text?: string }> = [];
vi.mock("nodemailer", () => ({
    default: {
        createTransport: () => ({
            sendMail: async (message: (typeof sent)[number]) => {
                sent.push(message);
                return { messageId: "test" };
            },
            use: () => {},
        }),
    },
}));

import * as mail from "./nodemailer.utils";

const last = () => sent[sent.length - 1].html;

const adminData: import("./nodemailer.utils").AdminOrderEmailData = {
    orderNumber: "DJV-1",
    orderDate: "29 Oct 2026",
    paymentMethod: "CASH_ON_DELIVERY",
    paymentStatus: "UNPAID",
    orderStatus: "ORDER_PLACED",
    customer: { fullName: "Ram", email: "ram@example.com", phone: "9800000000", address: "Kathmandu" },
    vendors: [],
    subtotal: 0,
    shippingTotal: 0,
    discountTotal: 0,
    grandTotal: 0,
} as unknown as import("./nodemailer.utils").AdminOrderEmailData;

// QA BUG-024: vendor and admin mails printed CASH_ON_DELIVERY / UNPAID /
// ORDER_PLACED, and the customer's own order mail never said how they pay.
describe("payment and status wording in order emails", () => {
    it("names the payment method in words for the vendor", async () => {
        await mail.sendVendorOrderEmail("v@example.com", "CASH_ON_DELIVERY", "DJV-1", [{ name: "Kurta", quantity: 1, price: 500 }], { name: "Ram", phone: "98" });
        expect(last()).toContain("Cash on delivery");
        expect(last()).not.toContain("CASH_ON_DELIVERY");
    });

    it("uses words for payment and order status for the admin", async () => {
        await mail.sendAdminOrderCreatedEmail("admin@example.com", adminData);
        const html = last();
        expect(html).toContain("Cash on delivery");
        expect(html).toContain("Unpaid");
        expect(html).not.toMatch(/CASH_ON_DELIVERY|>UNPAID<|ORDER_PLACED/);
    });

    it("tells the customer how they are paying", async () => {
        await mail.sendCustomerOrderEmail(
            "c@example.com", "DJV-1", 0, 100,
            [{ name: "Kurta", quantity: 1, price: 500, vendorName: "Alpha", vendorDistrict: "Kathmandu" }],
            "Kathmandu", undefined, 0, null, undefined, null, [], "ESEWA",
        );
        expect(last()).toContain("eSewa");
    });
});
