import { beforeEach, describe, expect, it, vi } from "vitest";

// Every template goes through one transporter; capture what it would send.
const sent: Array<{ to: string; subject: string; html: string; replyTo?: string; from?: string }> = [];
vi.mock("nodemailer", () => ({
    default: {
        createTransport: () => ({
            sendMail: async (message: (typeof sent)[number]) => {
                sent.push(message);
                return { messageId: "test" };
            },
        }),
    },
}));

import * as mail from "./nodemailer.utils";

const EVIL = `<script>alert(1)</script>`;
const last = () => sent[sent.length - 1];

const adminData: import("./nodemailer.utils").AdminOrderEmailData = {
    orderNumber: "DJV-1",
    orderDate: "29 Sept 2026",
    paymentMethod: "CASH_ON_DELIVERY",
    paymentStatus: "UNPAID",
    orderStatus: "DELIVERED",
    customer: { fullName: `Ram ${EVIL}`, email: "ram@example.com", phone: "9800000000", address: "Baneshwor, Kathmandu" },
    vendors: [
        {
            name: "Alpha Store",
            email: "alpha@example.com",
            phone: "9811111111",
            district: "Kathmandu",
            items: [{ name: `Kurta ${EVIL}`, variant: "Size: M", sku: "K-1", quantity: 2, unitPrice: 500, lineTotal: 1000 }],
            subtotal: 1000,
            shippingFee: 100,
        },
    ],
    subtotal: 1000,
    shippingTotal: 100,
    discountTotal: 50,
    grandTotal: 1050,
    districtShipping: [],
    appliedPromoCode: "SAVE50",
};

beforeEach(() => {
    sent.length = 0;
});

describe("email templates", () => {
    it("share one layout and never pass markup through from data", async () => {
        await mail.sendCustomerOrderEmail(
            "c@example.com", "DJV-1", 0, 100,
            [{ name: `Kurta ${EVIL}`, quantity: 2, price: 500, vendorName: "Alpha", vendorDistrict: "Kathmandu", variantAttributes: { Size: "M" } }],
            "Kathmandu", undefined, 50, "SAVE50",
        );
        await mail.sendVendorOrderEmail("v@example.com", "COD", "DJV-1", [{ name: `Kurta ${EVIL}`, quantity: 1, price: 500 }], { name: `Ram ${EVIL}`, phone: "98" });
        await mail.sendAdminOrderCreatedEmail("admin@example.com", adminData);
        await mail.sendOrderStatusEmail("c@example.com", "DJV-1", "DELIVERED", undefined, { orderId: 9, order: adminData });
        await mail.sendVendorOrderStatusEmail("v@example.com", "DJV-1", "CANCELLED", undefined, { vendor: adminData.vendors[0] });
        await mail.sendOrderItemCancelledEmail("c@example.com", "DJV-1", `Kurta ${EVIL}`, 1, `Out of stock ${EVIL}`);
        await mail.sendVendorApprovedEmail("v@example.com", `Alpha ${EVIL}`);
        await mail.sendVendorRejectedEmail("v@example.com", "Alpha", `Blurry ${EVIL}`);
        await mail.sendVendorApplicationEmail("v@example.com", `Alpha ${EVIL}`);
        await mail.sendVerificationEmail("c@example.com", "Verify", "123456");
        await mail.sendTransactionalEmail("v@example.com", "Account update", `Hello ${EVIL}`);

        expect(sent).toHaveLength(11);
        for (const message of sent) {
            expect(message.html).toContain("<!doctype html>");
            expect(message.html).toContain('name="viewport"');
            expect(message.html).not.toContain(EVIL);
            expect(message.from).toMatch(/^"DajuVai" </);
        }
    });

    it("totals the customer order, including the promo", async () => {
        await mail.sendCustomerOrderEmail(
            "c@example.com", "DJV-1", 0, 100,
            [{ name: "Kurta", quantity: 2, price: 500, vendorName: "Alpha", vendorDistrict: "Kathmandu" }],
            "Kathmandu", undefined, 50, "SAVE50",
        );
        const html = last().html;
        expect(html).toContain("Rs 1,000.00"); // items
        expect(html).toContain("Promo (SAVE50)");
        expect(html).toContain("Rs 1,050.00"); // 1000 + 100 - 50
        expect(html).toContain("arrives in 2–3 days"); // same district
    });

    it("puts the order's items and progress in a status email", async () => {
        await mail.sendOrderStatusEmail("c@example.com", "DJV-1", "ASSIGNED_TO_RIDER", undefined, { orderId: 9, order: adminData });
        const { html, subject } = last();
        expect(subject).toBe("Order #DJV-1 is now Out for Delivery");
        expect(html).toContain("On the way");
        expect(html).toContain("Size: M");
        expect(html).toContain("/account/orders/9");
    });

    it("sends the delivered notice to the address it is given", async () => {
        await mail.sendAdminOrderDeliveredEmail("ops@example.com", adminData);
        expect(last().to).toBe("ops@example.com");
    });

    it("states the real code lifetime", async () => {
        await mail.sendVerificationEmail("c@example.com", "Verify", "123456");
        expect(last().html).toContain("15 minutes");
        expect(last().html).not.toContain("2 minutes");
    });

    it("replies to the visitor, not from them", async () => {
        await mail.sendContactEmail({ firstName: "Sita", lastName: "K", email: "sita@example.com", phone: "98", subject: "Hi", message: `x ${EVIL}` } as never);
        expect(last().replyTo).toBe("sita@example.com");
        expect(last().from).not.toContain("sita@example.com");
        expect(last().html).not.toContain(EVIL);
    });

    it("gives each seller their own block and shipping, even in the same district", async () => {
        await mail.sendCustomerOrderEmail(
            "c@example.com", "DJV-2", 0, 250,
            [
                { name: "Kurta", quantity: 1, price: 1000, vendorId: 1, vendorName: "Alpha", vendorDistrict: "Kathmandu" },
                { name: "Earphone", quantity: 1, price: 300, vendorId: 2, vendorName: "Beta", vendorDistrict: "Kathmandu" },
            ],
            "Kathmandu", undefined, 0, null, undefined, null,
            [
                { vendorId: 1, vendorNameSnapshot: "Alpha", vendorDistrictSnapshot: "Kathmandu", shippingFee: 100, vendorMerchandiseSubtotal: 1000 },
                { vendorId: 2, vendorNameSnapshot: "Beta", vendorDistrictSnapshot: "Kathmandu", shippingFee: 150, vendorMerchandiseSubtotal: 300 },
            ],
        );
        const html = last().html;
        expect(html).toContain(">Alpha<");
        expect(html).toContain(">Beta<");
        expect(html).toContain("Rs 1,100.00"); // Alpha: 1000 + 100
        expect(html).toContain("Rs 450.00"); // Beta: 300 + 150
        expect(html).toContain("Summary by seller");
        expect(html).toContain("Rs 1,550.00"); // order total
        expect(html).toContain("res.cloudinary.com");
    });
});
