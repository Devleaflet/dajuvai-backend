import nodemailer from "nodemailer";
import config from "../config/env.config";
import { ContactInput } from "./zod_validations/contact.zod";
import { generateContactEmailHTML } from "./emailTemplate.utils";
import {
    EmailLineItem,
    EmailTone,
    ItemsTableFooterRow,
    TotalRow,
    appUrl,
    button,
    codeBox,
    detailsTable,
    emailLayout,
    esc,
    heading,
    itemsTable,
    money,
    notice,
    numberedSteps,
    orderProgress,
    paragraph,
    pill,
    simpleTable,
    totalsTable,
} from "./emailLayout.utils";

// Configure nodemailer transporter with Gmail SMTP using credentials from env
const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: config.USER_EMAIL, // Your Gmail email address
        pass: config.PASS_EMAIL, // App password or actual password (prefer app password for security)
    },
});

/** "DajuVai" as the sender name, so the inbox does not show a bare address. */
const FROM = () => `"DajuVai" <${config.USER_EMAIL}>`;

export const isEmailConfigured = (): boolean =>
    Boolean(config.USER_EMAIL && config.PASS_EMAIL);

/**
 * Plain notices — vendor account events and the like — sent through the
 * durable delivery worker. The message is text; it is laid out, not trusted.
 */
export const sendTransactionalEmail = async (
    to: string,
    subject: string,
    message: string,
): Promise<string> => {
    if (!isEmailConfigured()) {
        throw new Error("SMTP is not configured");
    }
    const result = await transporter.sendMail({
        from: FROM(),
        to,
        subject,
        text: message,
        html: emailLayout({
            preheader: message.slice(0, 120),
            title: subject,
            html: paragraph(message),
        }),
    });
    return result.messageId;
};

type StatusMeta = { label: string; tone: EmailTone; copy: string };

const getOrderStatusEmailMeta = (status: string): StatusMeta => {
    const normalized = status.toUpperCase();
    const map: Record<string, StatusMeta> = {
        ORDER_PLACED: { label: "Order Placed", tone: "warning", copy: "We have received your order and are waiting for confirmation." },
        CONFIRMED: { label: "Confirmed", tone: "info", copy: "Your order is confirmed and will move into preparation soon." },
        PROCESSING: { label: "Processing", tone: "info", copy: "Your order is being prepared by the seller." },
        ARRIVED_AT_WAREHOUSE: { label: "At Warehouse", tone: "info", copy: "Your order has arrived at our warehouse and is being prepared for delivery." },
        DELAYED: { label: "Delayed", tone: "danger", copy: "Order is taking longer than expected. We will keep you updated." },
        ASSIGNED_TO_RIDER: { label: "Out for Delivery", tone: "info", copy: "Your order has been handed to a delivery rider and is on the way." },
        DELIVERED: { label: "Delivered", tone: "success", copy: "Your order has been delivered. Thank you for shopping with DajuVai." },
        NOT_RECEIVED: { label: "Not Received", tone: "warning", copy: "We were unable to deliver your order. Our team will reach out shortly to reschedule." },
        CANCELLED: { label: "Cancelled", tone: "danger", copy: "Your order has been cancelled. Contact support if this looks wrong." },
        RETURNED: { label: "Returned", tone: "warning", copy: "Your return has been recorded for this order." },
    };
    return map[normalized] ?? { label: normalized, tone: "neutral", copy: "Your order status has changed. View your account for details." };
};

const getVendorOrderStatusEmailMeta = (status: string): StatusMeta => {
    const normalized = status.toUpperCase();
    const map: Record<string, StatusMeta> = {
        ORDER_PLACED: { label: "Order Placed", tone: "warning", copy: "A new order has been placed for one of your products." },
        CONFIRMED: { label: "Confirmed", tone: "info", copy: "This order is confirmed. Please prepare the items for pickup." },
        PROCESSING: { label: "Processing", tone: "info", copy: "This order is being prepared. Please ensure it is packed and ready for pickup." },
        ARRIVED_AT_WAREHOUSE: { label: "At Warehouse", tone: "info", copy: "This order has arrived at the warehouse." },
        DELAYED: { label: "Delayed", tone: "danger", copy: "This order is currently delayed. Please ensure it is fulfilled and dispatched as soon as possible." },
        ASSIGNED_TO_RIDER: { label: "Out for Delivery", tone: "info", copy: "This order has been handed to a delivery rider." },
        DELIVERED: { label: "Delivered", tone: "success", copy: "This order has been successfully delivered to the customer." },
        NOT_RECEIVED: { label: "Not Received", tone: "warning", copy: "The customer did not receive this order. Please check your dashboard for details." },
        CANCELLED: { label: "Cancelled", tone: "danger", copy: "This order has been cancelled. Please do not fulfill this order if it hasn't been shipped yet." },
        RETURNED: { label: "Returned", tone: "warning", copy: "This order has been returned by the customer. Please expect the returned items." },
    };
    return map[normalized] ?? { label: normalized, tone: "neutral", copy: "The status of this order has changed. Please check your dashboard for details." };
};

const variantText = (attributes?: Record<string, string> | null): string | null =>
    attributes && Object.keys(attributes).length
        ? Object.entries(attributes)
              .map(([key, value]) => `${key}: ${value}`)
              .join(", ")
        : null;

/**
 * One seller's block: their items, then their own subtotal, shipping and
 * total. Shipping is left out only when it is genuinely unknown.
 */
const sellerBlock = (
    title: string,
    subtitle: string | undefined,
    items: EmailLineItem[],
    subtotal: number,
    shipping: number | null,
) => {
    const footer: ItemsTableFooterRow[] = [{ label: "Items subtotal", amount: subtotal }];
    if (shipping !== null) {
        footer.push({ label: "Shipping", amount: shipping });
        footer.push({ label: "Seller total", amount: subtotal + shipping, total: true });
    } else {
        footer[0].total = true;
    }
    return itemsTable(items, { title, subtitle, footer });
};

/** The per-seller recap under the blocks, for orders from more than one seller. */
const sellerSummary = (rows: Array<{ seller: string; items: number; shipping: number }>) =>
    rows.length > 1
        ? heading("Summary by seller") +
          simpleTable(
              ["Seller", "Items", "Shipping", "Total"],
              rows.map((r) => [r.seller, money(r.items), money(r.shipping), money(r.items + r.shipping)]),
              [1, 2, 3],
          )
        : "";

/**
 * Sends an email when the contact form is submitted. It comes from our own
 * address with the visitor as reply-to: Gmail rewrites or rejects a `from` it
 * cannot vouch for, which is what the visitor's address would be.
 */
export const sendContactEmail = async (dto: ContactInput) => {
    await transporter.sendMail({
        from: FROM(),
        to: config.USER_EMAIL,
        replyTo: dto.email,
        subject: `New Contact Form Submission: ${dto.subject}`,
        html: generateContactEmailHTML(dto),
    });
};

/**
 * Sends a one-time code. Without a token it is the legacy "vendor approved"
 * note some callers still send through this function.
 */
export const sendVerificationEmail = async (
    to: string,
    sub: string,
    token?: string,
) => {
    const html = token
        ? emailLayout({
              preheader: `Your DajuVai code is ${token}. It expires in 15 minutes.`,
              eyebrow: "Security",
              title: "Your verification code",
              html: [
                  paragraph("Use the code below to finish what you started on DajuVai."),
                  codeBox(token, "Verification code"),
                  notice("This code expires in <strong>15 minutes</strong>. Never share it with anyone — DajuVai staff will never ask for it.", "warning"),
                  paragraph("If you didn't request this code, you can safely ignore this email; your account is unchanged."),
              ].join(""),
          })
        : emailLayout({
              preheader: "Your vendor account has been approved.",
              eyebrow: "Vendor account",
              title: "Vendor account approved",
              html: [
                  paragraph("Congratulations! Your account has been successfully approved as a vendor."),
                  paragraph("You can now log in to your account and start using your vendor features."),
                  button("Open vendor dashboard", appUrl("/vendor/login")),
              ].join(""),
              footerNote: "If you did not expect this email, please contact our support team immediately.",
          });

    await transporter.sendMail({ from: FROM(), to, subject: sub, html });
};

type CustomerOrderItem = {
    name: string;
    vendorId?: number | null;
    sku?: string | null;
    quantity: number;
    price: number;
    variantAttributes?: Record<string, string> | null;
    vendorDistrict?: string | null;
    vendorName?: string | null;
    basePriceSnapshot?: number | null;
    productDiscountSnapshot?: number | null;
    dealDiscountSnapshot?: number | null;
    discountLabelSnapshot?: string | null;
    dealNameSnapshot?: string | null;
};

const toLineItem = (item: CustomerOrderItem): EmailLineItem => {
    const productDiscount = Number(item.productDiscountSnapshot) || 0;
    const dealDiscount = Number(item.dealDiscountSnapshot) || 0;
    return {
        name: item.name,
        details: [variantText(item.variantAttributes), item.sku ? `SKU ${item.sku}` : null],
        tags: [
            productDiscount > 0 ? item.discountLabelSnapshot : null,
            dealDiscount > 0 && item.dealNameSnapshot ? `Deal: ${item.dealNameSnapshot}` : null,
        ],
        quantity: item.quantity,
        unitPrice: Number(item.price) || 0,
        originalUnitPrice: productDiscount + dealDiscount > 0 ? Number(item.basePriceSnapshot) || null : null,
    };
};

export const sendCustomerOrderEmail = async (
    to: string,
    orderNumber: string,
    tp: number, // not in use right now
    shippingFee: number,
    items: CustomerOrderItem[],
    userDistrict?: string | null,
    subject = "Your Order Has Been Placed",
    discountTotal = 0,
    appliedPromoCode?: string | null,
    manualIdVerification?: { required: boolean; minimumAge: number | null },
    promoApplyOn?: string | null,
    vendorShippings?: any[],
) => {
    // totalPrice/shippingFee come from TypeORM `numeric` columns, which arrive
    // as strings — coerce here or `.toFixed()` throws and `+` silently
    // string-concatenates instead of adding.
    shippingFee = Number(shippingFee) || 0;
    const discount = Number(discountTotal) || 0;

    // One block per seller: that is how the order ships, what it costs to
    // ship, and where the delivery estimate comes from.
    const groups = new Map<string, { vendorId: number | null; vendor: string | null; district: string; items: CustomerOrderItem[] }>();
    for (const item of items) {
        const district = item.vendorDistrict || "Unknown district";
        const key = item.vendorId ? `id:${item.vendorId}` : `${item.vendorName ?? ""}|${district}`;
        if (!groups.has(key))
            groups.set(key, { vendorId: item.vendorId ?? null, vendor: item.vendorName ?? null, district, items: [] });
        groups.get(key)!.items.push(item);
    }

    const shippingFor = (group: { vendorId: number | null; vendor: string | null; district: string }): number | null => {
        const match = (vendorShippings ?? []).find((vs) =>
            group.vendorId
                ? Number(vs.vendorId) === group.vendorId
                : (vs.vendorNameSnapshot ?? null) === group.vendor && (vs.vendorDistrictSnapshot || "Unknown district") === group.district,
        );
        if (match) return Number(match.shippingFee) || 0;
        // One seller and no breakdown: the order's shipping is theirs.
        return groups.size === 1 ? shippingFee : null;
    };

    let totalPrice = 0;
    const summary: Array<{ seller: string; items: number; shipping: number }> = [];
    const sections = [...groups.values()].map((group) => {
        const sameDistrict =
            userDistrict && group.district &&
            userDistrict.trim().toLowerCase() === group.district.trim().toLowerCase();
        const estimate = sameDistrict ? "2–3 days" : "3–5 days";
        const subtotal = group.items.reduce((sum, i) => sum + (Number(i.price) || 0) * i.quantity, 0);
        const shipping = shippingFor(group);
        totalPrice += subtotal;
        summary.push({ seller: group.vendor ?? group.district, items: subtotal, shipping: shipping ?? 0 });
        return sellerBlock(
            group.vendor ?? `Seller in ${group.district}`,
            `Ships from ${group.district} · arrives in ${estimate}`,
            group.items.map(toLineItem),
            subtotal,
            shipping,
        );
    });

    const orderTotal = totalPrice + shippingFee - discount;
    const promoLabel = `Promo${appliedPromoCode ? ` (${appliedPromoCode})` : ""}${promoApplyOn === "SHIPPING" ? " on shipping" : ""}`;
    const totals: TotalRow[] = [
        { label: "Items subtotal", amount: totalPrice },
        { label: groups.size > 1 ? "Shipping (all sellers)" : "Shipping", amount: shippingFee },
        ...(discount > 0 ? [{ label: promoLabel, amount: discount, kind: "discount" as const }] : []),
        { label: "Total", amount: orderTotal, kind: "total" },
    ];

    const bySeller = sellerSummary(summary);

    const idNotice = manualIdVerification?.required
        ? notice(
              `This order contains age-restricted products${manualIdVerification.minimumAge ? ` (minimum age ${esc(manualIdVerification.minimumAge)}+)` : ""}. Our delivery team will check a valid government-issued photo ID before handing them over — please keep yours ready.`,
              "warning",
              "ID check on delivery",
          )
        : "";

    const html = emailLayout({
        preheader: `Order #${orderNumber} is confirmed · ${money(orderTotal)}`,
        eyebrow: "Order confirmed",
        title: "Thanks — your order is in",
        html: [
            paragraph("We've received your order and the sellers are getting it ready. Here's what you bought."),
            detailsTable([
                ["Order number", `#${orderNumber}`],
                ["Items", String(items.reduce((sum, i) => sum + i.quantity, 0))],
                ["Total", money(orderTotal)],
            ]),
            idNotice,
            heading(groups.size > 1 ? `Your items · ${groups.size} sellers` : "Your items"),
            sections.join(""),
            bySeller,
            heading("Payment summary"),
            totalsTable(totals),
            button("View your order", appUrl("/account/orders")),
            paragraph("We'll email you again as your order moves along."),
        ].join(""),
        footerNote: "If you did not place this order or have any concerns, please contact our support team immediately.",
    });

    await transporter.sendMail({ from: FROM(), to, subject, html });
};

interface VendorOrderItem {
    name: string;
    sku?: string | null;
    quantity: number;
    price: number;
    variantAttributes?: Record<string, string> | null;
    basePriceSnapshot?: number | null;
    productDiscountSnapshot?: number | null;
    dealDiscountSnapshot?: number | null;
    discountLabelSnapshot?: string | null;
    dealNameSnapshot?: string | null;
}

interface CustomerInfo {
    name: string;
    phone: string;
    email?: string;
    city?: string;
    district?: string;
    localAddress?: string;
    landmark?: string;
}

export const sendVendorOrderEmail = async (
    to: string,
    paymentMethod: string,
    orderNumber: string,
    // Shipping fee is not vendor revenue and is intentionally not shown here —
    // customer/admin emails carry the full shipping breakdown instead.
    products: VendorOrderItem[],
    customer: CustomerInfo,
    subject = "New Order Received",
) => {
    const vendorTotal = products.reduce((sum, item) => sum + (Number(item.price) || 0) * item.quantity, 0);
    const totalUnits = products.reduce((sum, item) => sum + item.quantity, 0);
    const fullAddress = [customer.localAddress, customer.landmark, customer.city, customer.district]
        .filter(Boolean)
        .join(", ");

    const html = emailLayout({
        preheader: `Order #${orderNumber} · ${totalUnits} item${totalUnits === 1 ? "" : "s"} · ${money(vendorTotal)}`,
        eyebrow: "New order",
        title: `You have a new order — #${orderNumber}`,
        html: [
            paragraph("Please review the details below and prepare the items for dispatch as soon as possible to keep delivery times on track."),
            heading("Items to pack"),
            itemsTable(products.map(toLineItem), {
                footer: [{ label: `Total (${totalUnits} item${totalUnits === 1 ? "" : "s"})`, amount: vendorTotal, total: true }],
            }),
            paragraph("This total does not include shipping, which is handled separately."),
            heading("Customer"),
            detailsTable([
                ["Name", customer.name],
                ["Email", customer.email],
                ["Phone", customer.phone],
                ["Address", fullAddress],
                ["Payment", paymentMethod],
            ]),
            button("Open your orders", appUrl("/vendor/orders")),
            notice("Pack and hand over this order within your usual processing window. Update its status from your vendor dashboard.", "brand"),
        ].join(""),
        footerNote: "This is an automated notification sent to registered vendors. If you believe there is an error in this order, please contact vendor support.",
    });

    await transporter.sendMail({ from: FROM(), to, subject, html });
};

/**
 * The order itself, for status emails: the items and totals as they stand.
 * Built from `AdminOrderEmailData` so every status email agrees with the
 * admin's copy of the same order.
 */
export interface OrderStatusEmailDetails {
    orderId?: number;
    order?: AdminOrderEmailData;
}

/**
 * The order's items as one block per seller. `withShipping` adds each seller's
 * shipping and total; vendors see only their merchandise.
 */
const orderItemsFromAdminData = (
    vendors: AdminOrderEmailVendor[],
    options: { withShipping: boolean; sellerDetails?: boolean },
) =>
    vendors
        .map((vendor) =>
            sellerBlock(
                vendor.name,
                options.sellerDetails
                    ? [vendor.district, vendor.phone, vendor.email].filter(Boolean).join(" · ")
                    : `Ships from ${vendor.district}`,
                vendor.items.map((item) => ({
                    name: item.name,
                    details: [item.variant, item.sku ? `SKU ${item.sku}` : null],
                    tags: [item.discount && item.discount > 0 ? `Saved ${money(item.discount)}` : null],
                    quantity: item.quantity,
                    unitPrice: Number(item.unitPrice) || 0,
                    lineTotal: Number(item.lineTotal) || 0,
                })),
                Number(vendor.subtotal) || 0,
                options.withShipping ? Number(vendor.shippingFee) || 0 : null,
            ),
        )
        .join("");

const summaryFromAdminData = (vendors: AdminOrderEmailVendor[]) =>
    sellerSummary(
        vendors.map((v) => ({ seller: v.name, items: Number(v.subtotal) || 0, shipping: Number(v.shippingFee) || 0 })),
    );

const statusBlock = (meta: StatusMeta, status: string) =>
    `<p style="margin:0 0 16px;">${pill(meta.label, meta.tone)}</p>` +
    orderProgress(status.toUpperCase()) +
    paragraph(meta.copy);

export const sendOrderStatusEmail = async (
    to: string,
    orderNumber: string,
    status: string,
    subject?: string,
    details: OrderStatusEmailDetails = {},
) => {
    const meta = getOrderStatusEmailMeta(status);
    const order = details.order;
    const link = details.orderId ? appUrl(`/account/orders/${details.orderId}`) : appUrl("/account/orders");

    const totals: TotalRow[] = order
        ? [
              { label: "Items subtotal", amount: order.subtotal },
              { label: order.vendors.length > 1 ? "Shipping (all sellers)" : "Shipping", amount: order.shippingTotal },
              ...(order.discountTotal > 0
                  ? [{ label: `Promo${order.appliedPromoCode ? ` (${order.appliedPromoCode})` : ""}`, amount: order.discountTotal, kind: "discount" as const }]
                  : []),
              { label: "Total", amount: order.grandTotal, kind: "total" },
          ]
        : [];

    const html = emailLayout({
        preheader: `Order #${orderNumber} is now ${meta.label}. ${meta.copy}`,
        eyebrow: `Order #${orderNumber}`,
        title: `Your order is ${meta.label.toLowerCase()}`,
        html: [
            statusBlock(meta, status),
            order
                ? heading("Order details") +
                  detailsTable([
                      ["Order number", `#${orderNumber}`],
                      ["Placed on", order.orderDate],
                      ["Payment", `${order.paymentMethod} · ${order.paymentStatus}`],
                      ["Deliver to", order.customer.address],
                  ]) +
                  heading(order.vendors.length > 1 ? `Items · ${order.vendors.length} sellers` : "Items") +
                  orderItemsFromAdminData(order.vendors, { withShipping: true }) +
                  summaryFromAdminData(order.vendors) +
                  heading("Payment summary") +
                  totalsTable(totals)
                : "",
            button("View order", link),
            paragraph(`If you did not expect this update, contact DajuVai support and mention order #${orderNumber}.`),
        ].join(""),
    });

    await transporter.sendMail({
        from: FROM(),
        to,
        subject: subject || `Order #${orderNumber} is now ${meta.label}`,
        html,
    });
};

export const sendOrderItemCancelledEmail = async (
    to: string,
    orderNumber: string,
    itemName: string,
    quantity: number,
    cancellationRemark?: string | null,
    subject = "An Item From Your Order Has Been Cancelled",
) => {
    const html = emailLayout({
        preheader: `${itemName} was removed from order #${orderNumber}.`,
        eyebrow: `Order #${orderNumber}`,
        title: "An item from your order was cancelled",
        html: [
            paragraph("The following item could not be fulfilled and has been cancelled. Its amount has been deducted from your order total."),
            detailsTable([
                ["Item", itemName],
                ["Quantity", String(quantity)],
                ["Reason", cancellationRemark],
            ]),
            `<p style="margin:0 0 16px;">${pill("Item cancelled", "danger")}</p>`,
            paragraph("The rest of your order is unaffected."),
            button("View order", appUrl("/account/orders")),
        ].join(""),
    });

    await transporter.sendMail({ from: FROM(), to, subject, html });
};

export const userOrderCancelledEmail = (userName: string, orderNumber: string) =>
    emailLayout({
        preheader: `Order #${orderNumber} was cancelled because payment was not completed.`,
        eyebrow: `Order #${orderNumber}`,
        title: "Your order was cancelled",
        html: [
            paragraph(`Hi ${userName},`),
            paragraph(`Your order #${orderNumber} has been automatically cancelled because the payment was not completed within the 15-minute payment window.`),
            notice("No payment was received, so any reserved items have been released back into stock.", "danger"),
            paragraph("If you'd still like these items, return to DajuVai and place a new order."),
            button("Continue shopping", appUrl("/")),
        ].join(""),
    });

export const sendVendorApprovedEmail = async (to: string, businessName: string) => {
    const html = emailLayout({
        preheader: "Your DajuVai vendor account is approved — you can start listing products.",
        eyebrow: "Vendor account",
        title: "Your vendor account is approved",
        html: [
            paragraph(`Dear ${businessName},`),
            paragraph("Congratulations! Your vendor account has been approved. You can now log in and start adding your products to the platform."),
            notice("Start listing your products and reach more customers through DajuVai.", "success", "You're all set"),
            button("Open vendor dashboard", appUrl("/vendor/login")),
            paragraph("Thank you for choosing DajuVai as your selling platform. We look forward to supporting your business as it grows."),
        ].join(""),
        footerNote: "If you have any questions, feel free to contact our support team.",
    });

    await transporter.sendMail({ from: FROM(), to, subject: "Vendor Account Approved", html });
};

export const sendVendorRejectedEmail = async (to: string, businessName: string, rejectionReason: string) => {
    const html = emailLayout({
        preheader: "An update on your DajuVai vendor application.",
        eyebrow: "Vendor application",
        title: "Your application was not approved",
        html: [
            paragraph(`Dear ${businessName},`),
            paragraph("Thank you for your interest in selling on DajuVai. After reviewing your application, we are unable to approve it at this time."),
            notice(esc(rejectionReason), "danger", "Reason"),
            paragraph("You are welcome to address the issue above and apply again. We hope to welcome you as a vendor soon."),
            button("Apply again", appUrl("/become-vendor")),
        ].join(""),
        footerNote: "If you have any questions, please feel free to contact our support team.",
    });

    await transporter.sendMail({ from: FROM(), to, subject: "Vendor Account Rejected", html });
};

export const sendVendorApplicationEmail = async (to: string, businessName: string) => {
    const html = emailLayout({
        preheader: "We've received your vendor application and will review it within 3–5 business days.",
        eyebrow: "Vendor application",
        title: "Application received",
        html: [
            paragraph(`Hi ${businessName},`),
            paragraph("Thank you for applying to become a vendor on DajuVai. We appreciate the time you took to complete your application."),
            `<p style="margin:0 0 16px;">${pill("Under review", "brand")}</p>`,
            notice("Our team usually reviews new applications within <strong>3–5 business days</strong>. We'll email you as soon as a decision is made.", "info"),
            heading("What happens next"),
            numberedSteps([
                "Our team reviews your business details and documents.",
                "We may reach out if we need anything else from you.",
                "You'll get an email confirming approval, with instructions to get started.",
            ]),
            paragraph("If you have questions in the meantime, our vendor support team is happy to help."),
        ].join(""),
    });

    await transporter.sendMail({ from: FROM(), to, subject: "Vendor Application Received", html });
};

export interface AdminOrderEmailItem {
    name: string;
    variant?: string | null;
    sku?: string | null;
    quantity: number;
    unitPrice: number;
    discount?: number | null;
    lineTotal: number;
}

export interface AdminOrderEmailVendor {
    name: string;
    email: string;
    phone: string;
    district: string;
    items: AdminOrderEmailItem[];
    subtotal: number;
    shippingFee: number;
}

export interface AdminOrderEmailData {
    orderNumber: string;
    orderDate: string;
    paymentMethod: string;
    paymentStatus: string;
    orderStatus: string;
    customer: {
        fullName: string;
        email: string;
        phone: string;
        address: string;
        landmark?: string | null;
    };
    vendors: AdminOrderEmailVendor[];
    subtotal: number;
    shippingTotal: number;
    discountTotal: number;
    grandTotal: number;
    districtShipping: Array<{ district: string; fee: number }>;
    appliedPromoCode?: string | null;
    promoApplyOn?: string | null;
}

const buildAdminOrderEmailHtml = (data: AdminOrderEmailData, mode: "created" | "delivered"): string => {
    const created = mode === "created";
    const discount = Number(data.discountTotal) || 0;

    const vendorSections = orderItemsFromAdminData(data.vendors, { withShipping: true, sellerDetails: true });

    const promoLabel = `Promo${data.appliedPromoCode ? ` (${data.appliedPromoCode})` : ""}${data.promoApplyOn === "SHIPPING" ? " on shipping" : ""}`;

    return emailLayout({
        preheader: `${created ? "New order" : "Delivered"} #${data.orderNumber} · ${money(data.grandTotal)} · ${data.customer.fullName}`,
        eyebrow: "Admin notification",
        title: created ? `New order #${data.orderNumber}` : `Order #${data.orderNumber} delivered`,
        html: [
            `<p style="margin:0 0 16px;">${pill(created ? "New order" : "Delivered", created ? "brand" : "success")}</p>`,
            paragraph(
                created
                    ? "A new order has been placed. Review the details and begin processing."
                    : "This order has been delivered to the customer. Delivery is complete.",
            ),
            heading("Order"),
            detailsTable([
                ["Order number", `#${data.orderNumber}`],
                ["Placed on", data.orderDate],
                ["Payment method", data.paymentMethod],
                ["Payment status", data.paymentStatus],
                ["Order status", data.orderStatus],
            ]),
            heading("Customer"),
            detailsTable([
                ["Name", data.customer.fullName],
                ["Email", data.customer.email],
                ["Phone", data.customer.phone],
                ["Shipping address", data.customer.address],
                ["Landmark", data.customer.landmark],
            ]),
            heading("Items by vendor"),
            vendorSections,
            summaryFromAdminData(data.vendors),
            heading("Payment summary"),
            totalsTable([
                { label: "Items subtotal", amount: data.subtotal },
                { label: data.vendors.length > 1 ? "Shipping (all sellers)" : "Shipping", amount: data.shippingTotal },
                ...(discount > 0 ? [{ label: promoLabel, amount: discount, kind: "discount" as const }] : []),
                { label: "Grand total", amount: data.grandTotal, kind: "total" },
            ]),
            button("Open in admin", appUrl("/admin/orders")),
        ].join(""),
        footerNote: "Internal notification sent to administrators only. Please do not reply to this email.",
    });
};

export const sendAdminOrderCreatedEmail = async (to: string, data: AdminOrderEmailData): Promise<void> => {
    await transporter.sendMail({
        from: FROM(),
        to,
        subject: `New Order Received - #${data.orderNumber}`,
        html: buildAdminOrderEmailHtml(data, "created"),
    });
};

export const sendAdminOrderDeliveredEmail = async (to: string, data: AdminOrderEmailData): Promise<void> => {
    await transporter.sendMail({
        from: FROM(),
        // The caller's address — this used to be a hardcoded personal inbox,
        // which received every delivered order's customer details.
        to,
        subject: `Order Delivered - #${data.orderNumber}`,
        html: buildAdminOrderEmailHtml(data, "delivered"),
    });
};

export const sendVendorOrderStatusEmail = async (
    to: string,
    orderNumber: string,
    status: string,
    subject?: string,
    details: { vendor?: AdminOrderEmailVendor } = {},
) => {
    const meta = getVendorOrderStatusEmailMeta(status);
    const vendor = details.vendor;

    const html = emailLayout({
        preheader: `Order #${orderNumber} is now ${meta.label}.`,
        eyebrow: `Order #${orderNumber}`,
        title: `Order #${orderNumber} is ${meta.label.toLowerCase()}`,
        html: [
            statusBlock(meta, status),
            vendor ? heading("Your items in this order") + orderItemsFromAdminData([vendor], { withShipping: false }) : "",
            button("Open your orders", appUrl("/vendor/orders")),
        ].join(""),
        footerNote: "This is an automated notification sent to registered vendors. Please do not reply to this email.",
    });

    await transporter.sendMail({
        from: FROM(),
        to,
        subject: subject || `Update for Order #${orderNumber}: ${meta.label}`,
        html,
    });
};
