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
    const map: Record<
        string,
        { label: string; color: string; bg: string; copy: string }
    > = {
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

    return (
        map[normalized] ?? {
            label: normalized,
            color: "#334155",
            bg: "#e2e8f0",
            copy: "Your order status has changed. View your account for details.",
        }
    );
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
                <!DOCTYPE html>
                <html lang="en">
                <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Email Verification</title>
                </head>
                <body style="margin:0; padding:0; background-color:#f4f5f7; font-family:'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:40px 0;">
                    <tr>
                      <td align="center">
                        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:6px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.06);">

                          <!-- Header / Brand -->
                          <tr>
                            <td style="background:linear-gradient(135deg,#c2410c,#ea580c); padding:32px 40px; text-align:center;">
                              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                                <tr>
                                  <td style="vertical-align:middle; padding-right:10px;">
                                    <div style="width:32px; height:32px; background-color:#ffffff; border-radius:6px; text-align:center; line-height:32px; font-size:18px; color:#ea580c; font-weight:bold;">B</div>
                                  </td>
                                  <td style="vertical-align:middle;">
                                    <span style="color:#ffffff; font-size:22px; font-weight:700; letter-spacing:0.5px;">Dajuvai</span>
                                  </td>
                                </tr>
                              </table>
                            </td>
                          </tr>

                          <!-- Body -->
                          <tr>
                            <td style="padding:40px 40px 24px 40px;">
                              <h1 style="margin:0 0 8px 0; font-size:20px; color:#0f172a; font-weight:700;">Verify Your Email Address</h1>
                              <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#475569;">
                                Thanks for joining Dajuvai. To complete your sign-in and keep your account secure, please use the verification code below.
                              </p>

                              <!-- Code Box -->
                              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                <tr>
                                  <td align="center" style="background-color:#fff7ed; border:1px dashed #fdba74; border-radius:6px; padding:24px;">
                                    <div style="font-size:13px; color:#9a3412; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Your Verification Code</div>
                                    <div style="font-size:34px; font-weight:800; color:#c2410c; letter-spacing:10px;">${token}</div>
                                  </td>
                                </tr>
                              </table>

                              <!-- Expiry Notice -->
                              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff7ed; border-left:4px solid #ea580c; border-radius:4px; margin-bottom:24px;">
                                <tr>
                                  <td style="padding:12px 16px;">
                                    <p style="margin:0; font-size:13.5px; color:#9a3412; line-height:1.5;">
                                       This code will expire in <strong>2 minutes</strong>. Please enter it promptly to complete verification.
                                    </p>
                                  </td>
                                </tr>
                              </table>

                              <p style="margin:0 0 8px 0; font-size:14px; line-height:1.6; color:#475569;">
                                If you didn't request this code, you can safely ignore this email.
                              </p>
                              <p style="margin:0; font-size:14px; line-height:1.6; color:#475569;">
                                For your security, never share this code with anyone.
                              </p>
                            </td>
                          </tr>

                          <!-- Divider -->
                          <tr>
                            <td style="padding:0 40px;">
                              <hr style="border:none; border-top:1px solid #e2e8f0; margin:0;">
                            </td>
                          </tr>

                          <!-- Footer -->
                          <tr>
                            <td style="padding:24px 40px 32px 40px; text-align:center;">
                              <p style="margin:0 0 4px 0; font-size:12.5px; color:#94a3b8;">
                                This is an automated message from Dajuvai. Please do not reply to this email.
                              </p>
                              
                            </td>
                          </tr>

                        </table>
                      </td>
                    </tr>
                  </table>
                </body>
                </html>
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
    orderNumber: string,
    tp: number, // not in use right now
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
    let totalPrice = 0;
    shippingFee = Number(shippingFee) || 0;
    // const OrderTotal = totalPrice + shippingFee;

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
                        <td style="padding:12px 10px; border-bottom:1px solid #f0e3d8;">
                          <strong style="color:#2b2b2b;">${item.name}</strong>${item.sku ? ` <span style="color:#999; font-size:12px;">(${item.sku})</span>` : ""}
                          ${
                              item.variantAttributes
                                  ? `<br><span style="color:#888; font-size:12px;">${Object.entries(
                                        item.variantAttributes,
                                    )
                                        .map(([key, val]) => `${key}: ${val}`)
                                        .join(", ")}</span>`
                                  : ""
                          }
                        </td>
                        <td style="padding:12px 10px; border-bottom:1px solid #f0e3d8; text-align:center; color:#444;">${
                            item.quantity
                        }</td>
                        <td style="padding:12px 10px; border-bottom:1px solid #f0e3d8; text-align:right; color:#444;">Rs ${
                            item.price
                        }</td>
                        <td style="padding:12px 10px; border-bottom:1px solid #f0e3d8; text-align:right; font-weight:600; color:#2b2b2b;">Rs ${(
                            item.price * item.quantity
                        ).toFixed(2)}</td>
                        <td style="padding:12px 10px; border-bottom:1px solid #f0e3d8; text-align:center; color:#c05a00; font-size:12px; font-weight:600;">${deliveryEstimate}</td>
                      </tr>
                    `;
            });

            const vendorSubtotal = vendorItems.reduce(
                (sum, i) => sum + i.price * i.quantity,
                0,
            );

            totalPrice += vendorSubtotal;

            return `
                  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:24px; border:1px solid #f0e3d8; border-radius:8px; overflow:hidden;">
                    <tr>
                      <td colspan="5" style="background-color:#fff4e9; padding:10px 14px; border-bottom:2px solid #ff7a1a;">
                        <span style="font-size:13px; font-weight:700; letter-spacing:0.3px; color:#c05a00; text-transform:uppercase;">Vendor District · ${vendorDistrict}</span>
                      </td>
                    </tr>
                    <tr style="background-color:#fafafa;">
                      <th style="padding:10px; text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8;">Product</th>
                      <th style="padding:10px; text-align:center; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8;">Qty</th>
                      <th style="padding:10px; text-align:right; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8;">Price</th>
                      <th style="padding:10px; text-align:right; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8;">Subtotal</th>
                      <th style="padding:10px; text-align:center; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8;">Delivery</th>
                    </tr>
                    <tbody>
                      ${rows.join("")}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colspan="4" style="padding:12px 10px; text-align:right; font-weight:700; color:#2b2b2b; background-color:#fafafa;">Vendor Subtotal:</td>
                        <td style="padding:12px 10px; text-align:right; font-weight:700; color:#c05a00; background-color:#fafafa;">Rs ${vendorSubtotal.toFixed(
                            2,
                        )}</td>
                      </tr>
                    </tfoot>
                  </table>
                `;
        },
    );

    const orderTotal = totalPrice + shippingFee;

    const mailOptions = {
        from: `<${config.USER_EMAIL}>`,
        to,
        subject,
        html: `
      <body style="margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; background-color:#f4f4f4;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" style="padding:24px 12px;">
              <table width="700" cellpadding="0" cellspacing="0" border="0" style="max-width:95%; background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.06);">

                <!-- Header -->
                <tr>
                  <td style="background: linear-gradient(135deg, #ff7a1a, #ff9a3d); padding:28px 30px; text-align:center;">
                    <h1 style="color:#ffffff; margin:0; font-size:22px; letter-spacing:0.4px;">Order Confirmed</h1>
                    <p style="color:#fff2e6; font-size:14px; margin:8px 0 0;">
                      Order <strong>#${orderNumber}</strong> has been placed successfully
                    </p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:30px;">
                    <p style="font-size:15px; color:#333; margin:0 0 24px;">
                      Thank you for shopping with us. We've received your order and it's now being prepared. Here's a summary of your purchase:
                    </p>

                    <h3 style="margin:0 0 14px; font-size:16px; color:#2b2b2b; border-left:4px solid #ff7a1a; padding-left:10px;">Order Summary</h3>
                    ${vendorSections.join("")}

                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-top:10px;">
                      <tfoot>
                        <tr>
                          <td style="padding:8px 10px; text-align:right; color:#555;">Subtotal:</td>
                          <td style="padding:8px 10px; text-align:right; color:#555; width:120px;">Rs ${totalPrice.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td style="padding:8px 10px; text-align:right; color:#555;">Shipping Fee:</td>
                          <td style="padding:8px 10px; text-align:right; color:#555;">Rs ${shippingFee.toFixed(2)}</td>
                        </tr>
                        <tr>
                          <td style="padding:14px 10px; text-align:right; font-weight:700; font-size:16px; color:#2b2b2b; border-top:2px solid #ff7a1a;">Total:</td>
                          <td style="padding:14px 10px; text-align:right; font-weight:700; font-size:16px; color:#ff7a1a; border-top:2px solid #ff7a1a;">Rs ${orderTotal.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </td>
                </tr>

                <!-- Info strip -->
                <tr>
                  <td style="padding:18px 30px; background-color:#fff4e9; font-size:14px; color:#7a4a1f;">
                    We are processing your order and will notify you once it has been shipped.
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:20px 30px; border-top:1px solid #eee; font-size:12px; color:#999; text-align:center;">
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
    orderNumber: string,
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
        Order <strong>#${orderNumber}</strong> has been placed. Please review and fulfill it promptly.
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
    orderNumber: string,
    status: string,
    subject = "Your Order Status Has Been Updated",
) => {
    const statusMeta = getOrderStatusEmailMeta(status);
    const orderLabel = `#${orderNumber}`;
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

export const userOrderCancelledEmail = (
    userName: string,
    orderNumber: string,
) => `
  <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
    <h2 style="color: #e63946;">Order Cancelled</h2>
    <p>Hi <strong>${userName}</strong>,</p>
    <p>Your order <strong>#${orderNumber}</strong> has been automatically cancelled because the payment wasn’t completed within 15 minutes.</p>
    <p>If this was a mistake, please place your order again.</p>
    <br/>
    <p>Best regards,<br/><strong>Your Shop Team</strong></p>
  </div>
`;

export const sendVendorApprovedEmail = async (
    to: string,
    businessName: string,
) => {
    const mailHtml = `
    <div style="background:#f6f6f6;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:4px;overflow:hidden;">

    <!-- Header -->
    <div style="background:#f97316;padding:20px 24px;">
      <h2 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;">
        Vendor Account Approved
      </h2>
    </div>

    <!-- Body -->
    <div style="padding:28px 24px;color:#444;line-height:1.7;font-size:15px;">

      <p style="margin-top:0;">
        Dear <strong>${businessName}</strong>,
      </p>

      <p>
        Congratulations! Your vendor account has been successfully approved. You can now log in to your account and start adding your products to the platform.
      </p>

      <div style="background:#fff7ed;border-left:4px solid #f97316;padding:14px 16px;margin:24px 0;">
        <strong style="color:#c2410c;">You're all set!</strong>
        <p style="margin:8px 0 0;">
          Start listing your products and reach more customers through Dajuvai.
        </p>
      </div>

      <p>
        Thank you for choosing <strong>Dajuvai</strong> as your selling platform. We're excited to have you as part of our community and look forward to supporting your business as it grows.
      </p>

      <p style="margin-bottom:0;">
        Best regards,<br>
        <strong>The Dajuvai Team</strong>
      </p>

    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #ececec;background:#fafafa;padding:16px 24px;text-align:center;font-size:12px;color:#777;">
      If you have any questions, feel free to contact our support team.
    </div>

  </div>
</div>
  `;

    const mailOptions = {
        from: `<${config.USER_EMAIL}>`,
        to,
        subject: "Vendor Account Approved",
        html: mailHtml,
    };

    await transporter.sendMail(mailOptions);
};

export const sendVendorRejectedEmail = async (
    to: string,
    businessName: string,
    rejectionReason: string,
) => {
    const mailHtml = `
<div style="background:#f6f6f6;padding:32px 16px;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e5;border-radius:4px;overflow:hidden;">

    <!-- Header -->
    <div style="background:#dc2626;padding:20px 24px;">
      <h2 style="margin:0;color:#ffffff;font-size:24px;font-weight:600;">
        Vendor Application Update
      </h2>
    </div>

    <!-- Body -->
    <div style="padding:28px 24px;color:#444;line-height:1.7;font-size:15px;">

      <p style="margin-top:0;">
        Dear <strong>${businessName}</strong>,
      </p>

      <p>
        Thank you for your interest in becoming a vendor on <strong>Dajuvai</strong>. After reviewing your application, we regret to inform you that it has not been approved at this time.
      </p>

      <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:14px 16px;margin:24px 0;">
        <strong style="color:#b91c1c;">Reason for Rejection</strong>
        <p style="margin:8px 0 0;color:#444;">
          ${rejectionReason}
        </p>
      </div>

      <p>
        We encourage you to address the issue mentioned above and submit a new application in the future. We appreciate your interest and hope to welcome you as a vendor soon.
      </p>

      <p style="margin-bottom:0;">
        Best regards,<br>
        <strong>The Dajuvai Team</strong>
      </p>

    </div>

    <!-- Footer -->
    <div style="border-top:1px solid #ececec;background:#fafafa;padding:16px 24px;text-align:center;font-size:12px;color:#777;">
      If you have any questions, please feel free to contact our support team.
    </div>

  </div>
</div>
  `;

    const mailOptions = {
        from: `<${config.USER_EMAIL}>`,
        to,
        subject: "Vendor Account Rejected",
        html: mailHtml,
    };

    await transporter.sendMail(mailOptions);
};
