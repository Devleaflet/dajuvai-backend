import nodemailer from "nodemailer";
import config from "../config/env.config";
import { ContactInput } from "./zod_validations/contact.zod";
import { generateContactEmailHTML } from "./emailTemplate.utils";

// Configure nodemailer transporter with Gmail SMTP using credentials from env
const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: config.USER_EMAIL, // Your Gmail email address
        pass: config.PASS_EMAIL, // App password or actual password (prefer app password for security)
    },
});

const escapeHtml = (value: unknown): string =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

const getOrderStatusEmailMeta = (status: string) => {
    const normalized = status.toUpperCase();
    const map: Record<string, { label: string; color: string; bg: string; copy: string }> = {
        PENDING: {
            label: "Pending",
            color: "#92400e",
            bg: "#fef3c7",
            copy: "We have received your order and are waiting for confirmation.",
        },
        CONFIRMED: {
            label: "Confirmed",
            color: "#1d4ed8",
            bg: "#dbeafe",
            copy: "Your order is confirmed and will move into preparation soon.",
        },
        PROCESSING: {
            label: "Processing",
            color: "#6d28d9",
            bg: "#ede9fe",
            copy: "Your order is being prepared by the seller.",
        },
        DELAYED: {
            label: "Delayed",
            color: "#be123c",
            bg: "#ffe4e6",
            copy: "Your order is taking longer than expected. We will keep you updated.",
        },
        SHIPPED: {
            label: "Shipped",
            color: "#0369a1",
            bg: "#e0f2fe",
            copy: "Your order has been handed to delivery and is on the way.",
        },
        DELIVERED: {
            label: "Delivered",
            color: "#047857",
            bg: "#d1fae5",
            copy: "Your order has been delivered. Thank you for shopping with DajuVai.",
        },
        CANCELLED: {
            label: "Cancelled",
            color: "#b91c1c",
            bg: "#fee2e2",
            copy: "Your order has been cancelled. Contact support if this looks wrong.",
        },
        RETURNED: {
            label: "Returned",
            color: "#854d0e",
            bg: "#fef9c3",
            copy: "Your return has been recorded for this order.",
        },
    };

    return map[normalized] ?? {
        label: normalized,
        color: "#334155",
        bg: "#e2e8f0",
        copy: "Your order status has changed. View your account for details.",
    };
};

/**
 * Sends an email when the contact form is submitted.
 * @param dto - ContactInput object validated by Zod with form data (name, email, subject, message)
 */
export const sendContactEmail = async (dto: ContactInput) => {
    // Email options including recipient, subject, and HTML body generated from dto
    const mailOptions = {
        from: `${dto.email}`, // sender address with friendly name
        to: `${config.USER_EMAIL}`, // support or admin email address
        subject: `New Contact Form Submission: ${dto.subject}`, // email subject line
        html: generateContactEmailHTML(dto), // formatted HTML content of the message
    };

    // Send mail asynchronously
    await transporter.sendMail(mailOptions);
};

/**
 * Sends a verification email containing a 6-digit token to the specified recipient.
 * @param to - Recipient email address
 * @param sub - Subject line for the verification email
 * @param token - Verification code to include in the email body
 */
export const sendVerificationEmail = async (
    to: string,
    sub: string,
    token?: string,
) => {
    const loginUrl = "https://dev.api.dajuvai.com/api/vendors/login";
    const mailOptions = {
        from: `<${config.USER_EMAIL}>`,
        to,
        subject: sub,
        html: `
        <div>
            ${
                token
                    ? `
                <h2>Email Verification</h2>
                <p>Your 6-digit verification code is:</p>
                <h3>${token}</h3>
                <p>This code will expire in 2 minutes</p>
            `
                    : `
                <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.5; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
                    <h2 style="color: #2E7D32; text-align: center;">Vendor Approved ✅</h2>
                    <p style="font-size: 16px; text-align: center;">
                        Congratulations! Your account has been successfully approved as a vendor.
                    </p>
                    <p style="font-size: 16px; text-align: center;">
                        You can now log in to your account via the app and start using your vendor features.
                    </p>
                    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
                    <p style="font-size: 12px; color: #888; text-align: center;">
                        If you did not expect this email, please contact our support team immediately.
                    </p>
                </div>
            `
            }
        </div>
    `,
    };

    // Send the verification email
    await transporter.sendMail(mailOptions);
};

export const sendCustomerOrderEmail = async (
    to: string,
    orderId: number,
    totalPrice: number,
    shippingFee: number,
    items: {
        name: string;
        sku?: string | null;
        quantity: number;
        price: number;
        variantAttributes?: Record<string, string> | null;
        vendorDistrict?: string | null;
        vendorName?: string | null; // optional if you want vendor name
    }[],
    userDistrict?: string | null,
    subject = "Your Order Has Been Placed",
) => {
    // totalPrice/shippingFee come from TypeORM `numeric` columns, which arrive
    // as strings — coerce here or `.toFixed()` throws and `+` silently
    // string-concatenates instead of adding.
    totalPrice = Number(totalPrice) || 0;
    shippingFee = Number(shippingFee) || 0;
    const OrderTotal = totalPrice + shippingFee;

    // Group items by vendorDistrict
    const groupedByVendor: Record<string, typeof items> = {};
    for (const item of items) {
        const vendorKey = item.vendorDistrict || "Unknown District";
        if (!groupedByVendor[vendorKey]) {
            groupedByVendor[vendorKey] = [];
        }
        groupedByVendor[vendorKey].push(item);
    }

    // Generate vendor sections
    const vendorSections = Object.entries(groupedByVendor).map(
        ([vendorDistrict, vendorItems]) => {
            const rows = vendorItems.map((item) => {
                console.log("Comparing districts ->", {
                    userDistrict,
                    vendorDistrict: item.vendorDistrict,
                });

                let deliveryEstimate = "3-5 days";
                if (userDistrict && item.vendorDistrict) {
                    if (
                        userDistrict.trim().toLowerCase() ===
                        item.vendorDistrict.trim().toLowerCase()
                    ) {
                        deliveryEstimate = "2-3 days";
                    }
                }

                return `
                      <tr>
                        <td style="padding:8px; border:1px solid #ddd;">
                          <strong>${item.name}</strong>${item.sku ? ` (${item.sku})` : ""}
                          ${
                              item.variantAttributes
                                  ? `<br>${Object.entries(
                                        item.variantAttributes,
                                    )
                                        .map(([key, val]) => `${key}: ${val}`)
                                        .join(", ")}`
                                  : ""
                          }
                        </td>
                        <td style="padding:8px; border:1px solid #ddd; text-align:center;">${
                            item.quantity
                        }</td>
                        <td style="padding:8px; border:1px solid #ddd; text-align:right;">Rs ${
                            item.price
                        }</td>
                        <td style="padding:8px; border:1px solid #ddd; text-align:right;">Rs ${(
                            item.price * item.quantity
                        ).toFixed(2)}</td>
                        <td style="padding:8px; border:1px solid #ddd; text-align:center;">${deliveryEstimate}</td>
                      </tr>
                    `;
            });

            const vendorSubtotal = vendorItems.reduce(
                (sum, i) => sum + i.price * i.quantity,
                0,
            );

            return `
                  <h4 style="margin-top:20px;">Vendor District: ${vendorDistrict}</h4>
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:20px;">
                    <thead>
                      <tr style="background-color:#f0f0f0;">
                        <th style="padding:8px; border:1px solid #ddd; text-align:left;">Product</th>
                        <th style="padding:8px; border:1px solid #ddd; text-align:center;">Qty</th>
                        <th style="padding:8px; border:1px solid #ddd; text-align:right;">Price</th>
                        <th style="padding:8px; border:1px solid #ddd; text-align:right;">Subtotal</th>
                        <th style="padding:8px; border:1px solid #ddd; text-align:center;">Delivery</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rows.join("")}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colspan="4" style="padding:8px; border:1px solid #ddd; text-align:right; font-weight:bold;">Vendor Subtotal:</td>
                        <td style="padding:8px; border:1px solid #ddd; text-align:right; font-weight:bold;">Rs ${vendorSubtotal.toFixed(
                            2,
                        )}</td>
                      </tr>
                    </tfoot>
                  </table>
                `;
        },
    );

    const mailOptions = {
        from: `<${config.USER_EMAIL}>`,
        to,
        subject,
        html: `
      <body style="margin:0; padding:0; font-family: Arial, sans-serif; background-color:#f9f9f9;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center">
              <table width="700" cellpadding="0" cellspacing="0" border="0" style="max-width:95%; background-color:#fff; border:1px solid #e0e0e0; border-radius:8px; padding:20px;">
                <tr>
                  <td style="text-align:center;">
                    <h2 style="color:#2E7D32; margin:0;">Order Confirmation ✅</h2>
                    <p style="font-size:16px; margin:10px 0;">
                      Thank you for your order! Your order <strong>#${orderId}</strong> has been successfully placed.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td>
                    <h3 style="margin-top:20px; margin-bottom:10px;">Order Summary</h3>
                    ${vendorSections.join("")}
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                      <tfoot>
                        <tr>
                          <td colspan="4" style="padding:8px; border:1px solid #ddd; text-align:right; font-weight:bold;">Subtotal:</td>
                          <td style="padding:8px; border:1px solid #ddd; text-align:right; font-weight:bold;">Rs ${totalPrice.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td colspan="4" style="padding:8px; border:1px solid #ddd; text-align:right; font-weight:bold;">Shipping Fee:</td>
                          <td style="padding:8px; border:1px solid #ddd; text-align:right; font-weight:bold;">Rs ${shippingFee.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td colspan="4" style="padding:8px; border:1px solid #ddd; text-align:right; font-weight:bold;">Total:</td>
                          <td style="padding:8px; border:1px solid #ddd; text-align:right; font-weight:bold;">Rs ${OrderTotal.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td style="padding-top:20px; font-size:14px;">
                    We are processing your order and will notify you once it has been shipped.
                  </td>
                </tr>

                <tr>
                  <td style="padding-top:20px; border-top:1px solid #e0e0e0; font-size:12px; color:#888; text-align:center;">
                    If you did not place this order or have any concerns, please contact our support team immediately.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    `,
    };

    await transporter.sendMail(mailOptions);
};

interface VendorOrderItem {
    name: string;
    sku?: string | null;
    quantity: number;
    price: number;
    variantAttributes?: Record<string, string> | null;
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
    orderId: number,
    // Shipping fee is not vendor revenue and is intentionally not shown here —
    // customer/admin emails carry the full shipping breakdown instead.
    products: VendorOrderItem[],
    customer: CustomerInfo,
    subject = "New Order Received",
) => {
    // Generate HTML rows for each product
    const productList = products
        .map((item) => {
            let variantAttributes = "";
            if (item.variantAttributes) {
                variantAttributes =
                    " (" +
                    Object.entries(item.variantAttributes)
                        .map(([key, val]) => `${key}: ${val}`)
                        .join(", ") +
                    ")";
            }

            return `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${item.name}${variantAttributes}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.sku || "-"}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">Rs ${item.price}</td>
      </tr>
    `;
        })
        .join("");

    const vendorTotal = products.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
    );
    // const orderTotal = vendorTotal + shippingFee;

    // Combine address fields into a single string
    const fullAddress = [
        customer.localAddress,
        customer.landmark,
        customer.city,
        customer.district,
    ]
        .filter(Boolean)
        .join(", ");

    // Email HTML
    const mailHtml = `
    <div style="font-family: Arial, sans-serif; max-width: 650px; margin: auto; padding: 20px; background: #ffffff; border-radius: 8px; border: 1px solid #e0e0e0;">
      
      <!-- Header -->
      <h2 style="color: #333; text-align: center;">🛒 New Order Received</h2>
      <p style="text-align: center; font-size: 16px;">
        Order <strong>#${orderId}</strong> has been placed. Please review and fulfill it promptly.
      </p>

      <!-- Customer Info -->
      <div style="margin-bottom: 20px;">
        <h3>Customer Details</h3>
        <p><strong>Name:</strong> ${customer.name}</p>
        ${customer.email ? `<p><strong>Email:</strong> ${customer.email}</p>` : ""}
        <p><strong>Phone:</strong> ${customer.phone}</p>
        ${fullAddress ? `<p><strong>Address:</strong> ${fullAddress}</p>` : ""}
        <p><strong>Payment Method:</strong> ${paymentMethod}</p>
      </div>

      <!-- Products Table -->
      <h3>Order Items</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th style="padding: 8px; border: 1px solid #ddd;">Product</th>
            <th style="padding: 8px; border: 1px solid #ddd;">SKU</th>
            <th style="padding: 8px; border: 1px solid #ddd;">Qty</th>
            <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${productList}
        </tbody>
      </table>

      <!-- Totals (vendor payout basis — shipping is not vendor revenue) -->
      <table style="width: 100%; margin-bottom: 20px; font-size: 15px;">
        
        <tr>
          <td style="text-align: right; padding: 8px 0 0; border-top: 1px solid #eee; font-size: 16px;"><strong>Total:</strong></td>
          <td style="text-align: right; padding: 8px 0 0; border-top: 1px solid #eee; font-size: 16px;"><strong>Rs ${vendorTotal.toFixed(2)}</strong></td>
        </tr>
      </table>

      <!-- Footer -->
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 13px; text-align: center; color: #666;">
        This is an automated notification. Contact support if there are any issues with this order.
      </p>
    </div>
  `;

    // Send email
    await transporter.sendMail({
        from: `<${config.USER_EMAIL}>`,
        to,
        subject,
        html: mailHtml,
    });
};

const sendLegacyOrderStatusEmail = async (
    to: string,
    orderId: number,
    status: string,
    subject = "Your Order Status Has Been Updated",
) => {
    const mailOptions = {
        from: `<${config.USER_EMAIL}>`,
        to,
        subject,
        html: `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #e3f2fd;">
        <h2 style="color: #1976d2; text-align: center;">Order Update 📦</h2>
        
        <p style="font-size: 16px; text-align: center;">
          The status of your order <strong>#${orderId}</strong> has been updated to:.
        </p>
        
        <div style="text-align: center; margin: 20px 0;">
          <span style="display: inline-block; padding: 10px 20px; border-radius: 6px; background-color: #1976d2; color: white; font-size: 16px; font-weight: bold;">
            ${status.toUpperCase()}
          </span>
        </div>

        <p style="font-size: 16px; text-align: center;">
          You can track your order in your account for more details.
        </p>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        
        <p style="font-size: 12px; color: #888; text-align: center;">
          If you have any questions, please contact our support team.
        </p>
      </div>
    `,
    };

    await transporter.sendMail(mailOptions);
};

export const sendOrderStatusEmail = async (
    to: string,
    orderId: number,
    status: string,
    subject = "Your Order Status Has Been Updated",
) => {
    const statusMeta = getOrderStatusEmailMeta(status);
    const orderLabel = `#${orderId}`;
    const accountUrl = `${config.FRONTEND_URL.replace(/\/$/, "")}/profile`;

    await transporter.sendMail({
        from: `<${config.USER_EMAIL}>`,
        to,
        subject: subject || `Order ${orderLabel} is now ${statusMeta.label}`,
        html: `
            <div style="margin:0;padding:0;background:#f6f7fb;font-family:Inter,Arial,sans-serif;color:#111827;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f6f7fb;">
                    <tr>
                        <td align="center" style="padding:32px 14px;">
                            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,0.08);">
                                <tr>
                                    <td style="padding:24px 28px;background:#111827;color:#ffffff;">
                                        <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#fb923c;">DajuVai order update</div>
                                        <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;font-weight:800;color:#ffffff;">Order ${escapeHtml(orderLabel)} is now ${escapeHtml(statusMeta.label)}</h1>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:28px;">
                                        <p style="margin:0 0 18px;font-size:16px;line-height:1.6;color:#374151;">${escapeHtml(statusMeta.copy)}</p>
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 22px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:10px;">
                                            <tr>
                                                <td style="padding:16px 18px;">
                                                    <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;">Order number</div>
                                                    <div style="margin-top:5px;font-size:18px;font-weight:800;color:#111827;">${escapeHtml(orderLabel)}</div>
                                                </td>
                                                <td align="right" style="padding:16px 18px;">
                                                    <span style="display:inline-block;padding:8px 13px;border-radius:999px;background:${statusMeta.bg};color:${statusMeta.color};font-size:12px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(statusMeta.label)}</span>
                                                </td>
                                            </tr>
                                        </table>
                                        <a href="${escapeHtml(accountUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#f97316;color:#ffffff;text-decoration:none;font-size:14px;font-weight:800;">View order details</a>
                                        <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#64748b;">If you did not expect this update, contact DajuVai support with order ${escapeHtml(orderLabel)}.</p>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;color:#64748b;font-size:12px;line-height:1.5;">
                                        This is an automated message from DajuVai. Please do not reply to this email.
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>
            </div>
        `,
    });
};

export const userOrderCancelledEmail = (userName: string, orderId: number) => `
  <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
    <h2 style="color: #e63946;">Order Cancelled</h2>
    <p>Hi <strong>${userName}</strong>,</p>
    <p>Your order <strong>#${orderId}</strong> has been automatically cancelled because the payment wasn’t completed within 15 minutes.</p>
    <p>If this was a mistake, please place your order again.</p>
    <br/>
    <p>Best regards,<br/><strong>Your Shop Team</strong></p>
  </div>
`;
