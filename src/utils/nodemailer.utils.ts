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

export const isEmailConfigured = (): boolean =>
    Boolean(config.USER_EMAIL && config.PASS_EMAIL);

/**
 * Minimal transactional fallback used by durable delivery worker. Existing
 * rich order/security templates remain available to legacy callers.
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
        from: `<${config.USER_EMAIL}>`,
        to,
        subject,
        text: message,
        html: `<p>${escapeHtml(message)}</p>`,
    });
    return result.messageId;
};

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
        ORDER_PLACED: {
            label: "Order Placed",
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
        ARRIVED_AT_WAREHOUSE: {
            label: "At Warehouse",
            color: "#7c3aed",
            bg: "#ede9fe",
            copy: "Your order has arrived at our warehouse and is being prepared for delivery.",
        },
        DELAYED: {
            label: "Delayed",
            color: "#be123c",
            bg: "#ffe4e6",
            copy: "Order is taking longer than expected. We will keep you updated.",
        },
        ASSIGNED_TO_RIDER: {
            label: "Out for Delivery",
            color: "#0369a1",
            bg: "#e0f2fe",
            copy: "Your order has been handed to a delivery rider and is on the way.",
        },
        DELIVERED: {
            label: "Delivered",
            color: "#047857",
            bg: "#d1fae5",
            copy: "Your order has been delivered. Thank you for shopping with DajuVai.",
        },
        NOT_RECEIVED: {
            label: "Not Received",
            color: "#b45309",
            bg: "#fef3c7",
            copy: "We were unable to deliver your order. Our team will reach out shortly to reschedule.",
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
    const loginUrl = "https://dev.api.dajuvai.com";
    const mailOptions = {
        from: `<${config.USER_EMAIL}>`,
        to,
        subject: sub,
        html: `
        <div>
            ${
                token
                    ? `
                <body style="margin:0; padding:0; background-color:#f4f5f7; font-family:Arial, Helvetica, sans-serif;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:40px 0;">
                    <tr>
                      <td align="center">
                        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:6px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.06);">

                          <!-- Header / Brand -->
                          <tr>
                            <td style="background:linear-gradient(135deg,#ea580c,#f97316); padding:32px 40px; text-align:center;">
                              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                                <tr>
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
                              <h1 style="margin:0 0 8px 0; font-size:20px; color:#0f172a; font-weight:700;">Your Verification Code</h1>
                              <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#475569;">
                                Please use the verification code below to complete your request and keep your account secure.
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
        vendorName?: string | null;
        basePriceSnapshot?: number | null;
        productDiscountSnapshot?: number | null;
        dealDiscountSnapshot?: number | null;
        discountLabelSnapshot?: string | null;
        dealNameSnapshot?: string | null;
    }[],
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

                const itemProductDiscount = Number(item.productDiscountSnapshot) || 0;
                const itemDealDiscount = Number(item.dealDiscountSnapshot) || 0;
                const itemBasePrice = Number(item.basePriceSnapshot) || 0;
                const hasItemDiscount = (itemProductDiscount + itemDealDiscount) > 0;

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
                          ${itemProductDiscount > 0 && item.discountLabelSnapshot ? `<br><span style="color:#2e7d32; font-size:11px;">🏷️ ${item.discountLabelSnapshot}</span>` : ""}
                          ${itemDealDiscount > 0 && item.dealNameSnapshot ? `<br><span style="color:#1565c0; font-size:11px;">⚡ Deal: ${item.dealNameSnapshot}</span>` : ""}
                        </td>
                        <td style="padding:12px 10px; border-bottom:1px solid #f0e3d8; text-align:center; color:#444;">${
                            item.quantity
                        }</td>
                        <td style="padding:12px 10px; border-bottom:1px solid #f0e3d8; text-align:right; color:#444;">
                          ${hasItemDiscount && itemBasePrice > 0 ? `<span style="text-decoration:line-through; color:#bbb; font-size:11px; display:block;">Rs ${Number(itemBasePrice).toFixed(2)}</span>` : ""}
                          Rs ${item.price}
                        </td>
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

    const discount = Number(discountTotal) || 0;
    const orderTotal = totalPrice + shippingFee - discount;

    let vendorSubtotalsSection = "";
    let shippingByVendorSection = "";

    if (vendorShippings && vendorShippings.length > 0) {
        const vendorSubtotalRows = vendorShippings.map((vs) => {
            return `
                <tr>
                    <td style="padding:8px 10px; color:#555;">${vs.vendorNameSnapshot || "Vendor"}, ${vs.vendorDistrictSnapshot || "Unknown District"}</td>
                    <td style="padding:8px 10px; text-align:right; color:#555; width:120px;">Rs ${Number(vs.vendorMerchandiseSubtotal || 0).toFixed(2)}</td>
                </tr>
            `;
        });

        const shippingByVendorRows = vendorShippings.map((vs) => {
            return `
                <tr>
                    <td style="padding:8px 10px; color:#555;">${vs.vendorNameSnapshot || "Vendor"}, ${vs.vendorDistrictSnapshot || "Unknown District"}</td>
                    <td style="padding:8px 10px; text-align:right; color:#555; width:120px;">Rs ${Number(vs.shippingFee || 0).toFixed(2)}</td>
                </tr>
            `;
        });

        vendorSubtotalsSection = `
            <h3 style="margin:24px 0 14px; font-size:16px; color:#2b2b2b; border-left:4px solid #ff7a1a; padding-left:10px;">Vendor Subtotals</h3>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:24px; border:1px solid #f0e3d8; border-radius:8px; overflow:hidden;">
                <tbody>
                    ${vendorSubtotalRows.join("")}
                    ${
                        discount > 0 && promoApplyOn !== "SHIPPING"
                            ? `<tr>
                      <td style="padding:8px 10px; color:#2e7d32;">Promo Code (${appliedPromoCode || ""})</td>
                      <td style="padding:8px 10px; text-align:right; color:#2e7d32;">-Rs ${discount.toFixed(2)}</td>
                    </tr>`
                            : ""
                    }
                </tbody>
                <tfoot>
                    <tr>
                      <td style="padding:12px 10px; font-weight:700; color:#2b2b2b; background-color:#fafafa;">Total Vendor Subtotal</td>
                      <td style="padding:12px 10px; text-align:right; font-weight:700; color:#c05a00; background-color:#fafafa;">Rs ${(totalPrice - (promoApplyOn !== "SHIPPING" ? discount : 0)).toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
        `;

        shippingByVendorSection = `
            <h3 style="margin:24px 0 14px; font-size:16px; color:#2b2b2b; border-left:4px solid #ff7a1a; padding-left:10px;">Shipping by Vendor</h3>
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:24px; border:1px solid #f0e3d8; border-radius:8px; overflow:hidden;">
                <tbody>
                    ${shippingByVendorRows.join("")}
                    ${
                        discount > 0 && promoApplyOn === "SHIPPING"
                            ? `<tr>
                      <td style="padding:8px 10px; color:#2e7d32;">Promo Code (${appliedPromoCode || ""})</td>
                      <td style="padding:8px 10px; text-align:right; color:#2e7d32;">-Rs ${discount.toFixed(2)}</td>
                    </tr>`
                            : ""
                    }
                </tbody>
                <tfoot>
                    <tr>
                      <td style="padding:12px 10px; font-weight:700; color:#2b2b2b; background-color:#fafafa;">Total Shipping</td>
                      <td style="padding:12px 10px; text-align:right; font-weight:700; color:#c05a00; background-color:#fafafa;">Rs ${(shippingFee - (promoApplyOn === "SHIPPING" ? discount : 0)).toFixed(2)}</td>
                    </tr>
                </tfoot>
            </table>
        `;
    }

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

                    ${
                        manualIdVerification?.required
                            ? `
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:0 0 24px; background-color:#fff4e5; border:2px solid #d97706; border-radius:8px; overflow:hidden;">
                      <tr>
                        <td style="padding:14px 16px;">
                          <span style="display:inline-block; font-size:11px; font-weight:700; letter-spacing:0.6px; text-transform:uppercase; color:#92400e; background-color:#fde68a; padding:3px 8px; border-radius:4px; margin-bottom:8px;">Age-Restricted Item</span>
                          <strong style="display:block; font-size:15px; color:#92400e; margin:0 0 6px;">Manual ID Verification Required</strong>
                          <p style="margin:0; font-size:13.5px; line-height:1.6; color:#78350f;">
                            This order contains age-restricted products${
                                manualIdVerification.minimumAge
                                    ? ` (minimum age ${manualIdVerification.minimumAge}+)`
                                    : ""
                            }. Our delivery team will verify your government-issued photo ID before handing over these items — please keep a valid ID ready.
                          </p>
                        </td>
                      </tr>
                    </table>
                    `
                            : ""
                    }

                    <h3 style="margin:0 0 14px; font-size:16px; color:#2b2b2b; border-left:4px solid #ff7a1a; padding-left:10px;">Order Summary</h3>
                    ${vendorSections.join("")}

                    ${vendorSubtotalsSection}
                    
                    ${shippingByVendorSection}

                    <h3 style="margin:24px 0 14px; font-size:16px; color:#2b2b2b; border-left:4px solid #ff7a1a; padding-left:10px;">Pricing Summary</h3>
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
    // Generate HTML rows for each product
    const rows = products.map((item) => {
        const itemProductDiscount = Number(item.productDiscountSnapshot) || 0;
        const itemDealDiscount = Number(item.dealDiscountSnapshot) || 0;
        const itemBasePrice = Number(item.basePriceSnapshot) || 0;
        const hasItemDiscount = (itemProductDiscount + itemDealDiscount) > 0;

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
                  ${itemProductDiscount > 0 && item.discountLabelSnapshot ? `<br><span style="color:#2e7d32; font-size:11px;">🏷️ ${item.discountLabelSnapshot}</span>` : ""}
                  ${itemDealDiscount > 0 && item.dealNameSnapshot ? `<br><span style="color:#1565c0; font-size:11px;">⚡ Deal: ${item.dealNameSnapshot}</span>` : ""}
                </td>
                <td style="padding:12px 10px; border-bottom:1px solid #f0e3d8; text-align:center; color:#444;">${item.quantity}</td>
                <td style="padding:12px 10px; border-bottom:1px solid #f0e3d8; text-align:right; color:#444;">
                  ${hasItemDiscount && itemBasePrice > 0 ? `<span style="text-decoration:line-through; color:#bbb; font-size:11px; display:block;">Rs ${Number(itemBasePrice).toFixed(2)}</span>` : ""}
                  Rs ${item.price}
                </td>
                <td style="padding:12px 10px; border-bottom:1px solid #f0e3d8; text-align:right; font-weight:600; color:#2b2b2b;">Rs ${(
                    item.price * item.quantity
                ).toFixed(2)}</td>
              </tr>
            `;
    });

    const vendorTotal = products.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
    );

    // Combine address fields into a single string
    const fullAddress = [
        customer.localAddress,
        customer.landmark,
        customer.city,
        customer.district,
    ]
        .filter(Boolean)
        .join(", ");

    const totalUnits = products.reduce((sum, item) => sum + item.quantity, 0);

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
                    <h1 style="color:#ffffff; margin:0; font-size:22px; letter-spacing:0.4px;">New Order Received</h1>
                    <p style="color:#fff2e6; font-size:14px; margin:8px 0 0;">
                      Order <strong>#${orderNumber}</strong> is awaiting fulfillment
                    </p>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:30px;">
                    <p style="font-size:15px; color:#333; margin:0 0 24px;">
                      You've received a new order on your store. Please review the details below and prepare the items for dispatch as soon as possible to keep delivery times on track.
                    </p>

                    <!-- Customer Details -->
                    <h3 style="margin:0 0 14px; font-size:16px; color:#2b2b2b; border-left:4px solid #ff7a1a; padding-left:10px;">Customer Details</h3>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:24px; border:1px solid #f0e3d8; border-radius:8px; overflow:hidden;">
                      <tbody>
                        <tr>
                          <td style="padding:10px 14px; width:140px; color:#888; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; background-color:#fafafa; border-bottom:1px solid #f0e3d8;">Name</td>
                          <td style="padding:10px 14px; color:#2b2b2b; border-bottom:1px solid #f0e3d8;">${customer.name}</td>
                        </tr>
                        ${
                            customer.email
                                ? `<tr>
                          <td style="padding:10px 14px; color:#888; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; background-color:#fafafa; border-bottom:1px solid #f0e3d8;">Email</td>
                          <td style="padding:10px 14px; color:#2b2b2b; border-bottom:1px solid #f0e3d8;">${customer.email}</td>
                        </tr>`
                                : ""
                        }
                        <tr>
                          <td style="padding:10px 14px; color:#888; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; background-color:#fafafa; border-bottom:1px solid #f0e3d8;">Phone</td>
                          <td style="padding:10px 14px; color:#2b2b2b; border-bottom:1px solid #f0e3d8;">${customer.phone}</td>
                        </tr>
                        ${
                            fullAddress
                                ? `<tr>
                          <td style="padding:10px 14px; color:#888; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; background-color:#fafafa; border-bottom:1px solid #f0e3d8;">Address</td>
                          <td style="padding:10px 14px; color:#2b2b2b; border-bottom:1px solid #f0e3d8;">${fullAddress}</td>
                        </tr>`
                                : ""
                        }
                        <tr>
                          <td style="padding:10px 14px; color:#888; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; background-color:#fafafa;">Payment Method</td>
                          <td style="padding:10px 14px; color:#2b2b2b;">${paymentMethod}</td>
                        </tr>
                      </tbody>
                    </table>

                    <!-- Order Items -->
                    <h3 style="margin:0 0 14px; font-size:16px; color:#2b2b2b; border-left:4px solid #ff7a1a; padding-left:10px;">Order Items</h3>
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:24px; border:1px solid #f0e3d8; border-radius:8px; overflow:hidden;">
                      <tr style="background-color:#fafafa;">
                        <th style="padding:10px; text-align:left; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8;">Product</th>
                        <th style="padding:10px; text-align:center; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8;">Qty</th>
                        <th style="padding:10px; text-align:right; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8;">Price</th>
                        <th style="padding:10px; text-align:right; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8;">Subtotal</th>
                      </tr>
                      <tbody>
                        ${rows.join("")}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colspan="3" style="padding:12px 10px; text-align:right; font-weight:700; color:#2b2b2b; background-color:#fafafa;">Total (${totalUnits} item${totalUnits === 1 ? "" : "s"}):</td>
                          <td style="padding:12px 10px; text-align:right; font-weight:700; color:#c05a00; background-color:#fafafa;">Rs ${vendorTotal.toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>

                    <p style="font-size:13px; color:#888; margin:0;">
                      Note: Above total amount does not include shipping fees. Shipping fees are handled separately.
                    </p>
                  </td>
                </tr>

                <!-- Info strip -->
                <tr>
                  <td style="padding:18px 30px; background-color:#fff4e9; font-size:14px; color:#7a4a1f;">
                    Please pack and hand over this order for pickup within your standard processing window. Log in to your vendor dashboard to print the packing slip and update the order status.
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="padding:20px 30px; border-top:1px solid #eee; font-size:12px; color:#999; text-align:center;">
                    This is an automated notification sent to registered vendors. If you believe there is error in this order, please contact our vendor support team.
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
    subject = "Order Status Has Been Updated",
) => {
    const statusMeta = getOrderStatusEmailMeta(status);
    const orderLabel = `#${orderNumber}`;
    const accountUrl = `${config.FRONTEND_URL.replace(/\/$/, "")}/user-profile`;

    await transporter.sendMail({
        from: `<${config.USER_EMAIL}>`,
        to,
        subject: subject || `Order ${orderLabel} is now ${statusMeta.label}`,
        html: `
            <div style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f4f4f4;">
                    <tr>
                        <td align="center" style="padding:24px 12px;">
                            <table role="presentation" width="700" cellspacing="0" cellpadding="0" style="max-width:95%;border-collapse:collapse;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.06);">

                                <!-- Header -->
                                <tr>
                                    <td style="background:linear-gradient(135deg, #ff7a1a, #ff9a3d);padding:28px 30px;text-align:center;">
                                        <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#fff2e6;">DajuVai Order Update</div>
                                        <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;letter-spacing:0.4px;">Your order is ${escapeHtml(statusMeta.label)}</h1>
                                    </td>
                                </tr>

                                <!-- Body -->
                                <tr>
                                    <td style="padding:30px;">
                                        <p style="font-size:15px;color:#333;margin:0 0 24px;">${escapeHtml(statusMeta.copy)}</p>

                                        <!-- Order Status -->
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:24px;border:1px solid #f0e3d8;border-radius:8px;overflow:hidden;">
                                            <tr style="background-color:#fafafa;">
                                                <td style="padding:16px 18px;border-bottom:1px solid #f0e3d8;">
                                                    <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#888;">Order Number</div>
                                                    <div style="margin-top:5px;font-size:18px;font-weight:800;color:#2b2b2b;">${escapeHtml(orderLabel)}</div>
                                                </td>
                                                <td align="right" style="padding:16px 18px;border-bottom:1px solid #f0e3d8;">
                                                    <span style="display:inline-block;padding:8px 13px;border-radius:999px;background:${statusMeta.bg};color:${statusMeta.color};font-size:12px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(statusMeta.label)}</span>
                                                </td>
                                            </tr>
                                        </table>

                                        <a href="${escapeHtml(accountUrl)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#ff7a1a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;">View Order Details</a>

                                        <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#888;">If you did not expect this update, please contact DajuVai support and reference order #${escapeHtml(orderLabel)}.</p>
                                    </td>
                                </tr>

                                <!-- Info strip -->
                                <tr>
                                    <td style="padding:18px 30px;background-color:#fff4e9;font-size:14px;color:#7a4a1f;">
                                        We'll keep you posted as your order moves through the next stages. You can track its progress anytime from your account.
                                    </td>
                                </tr>

                                <!-- Footer -->
                                <tr>
                                    <td style="padding:20px 30px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center;">
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
  
<body style="margin:0; padding:0; background:#f4f5f7; font-family:Arial, Helvetica, sans-serif;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7; padding:40px 0;">
  <tr>
    <td align="center">

      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:6px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.06);">

        <!-- Header -->
        <tr>
          <td style="background-color:#dc2626; padding:30px 40px; text-align:center;">
            <span style="font-size:22px; font-weight:700; color:#ffffff;">Dajuvai</span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">

            <h1 style="margin:0 0 12px; font-size:22px; font-weight:700; color:#b91c1c;">
              Order Cancelled
            </h1>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.7; color:#4b5563;">
              Hi <strong>${userName}</strong>,
            </p>

            <p style="margin:0 0 24px; font-size:15px; line-height:1.7; color:#4b5563;">
              Your order <strong>#${orderNumber}</strong> has been automatically cancelled because the payment was not completed within the required <strong>15-minute payment window</strong>.
            </p>

            <!-- Notice -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
              <tr>
                <td style="background:#fef2f2; border-left:4px solid #dc2626; padding:16px;">
                  <p style="margin:0; font-size:14px; line-height:1.6; color:#991b1b;">
                    No payment was received, so your order has been cancelled automatically and any reserved items have been released back into inventory.
                  </p>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 20px; font-size:15px; line-height:1.7; color:#4b5563;">
              If you'd still like to purchase these items, simply return to Dajuvai and place a new order.
            </p>

            <p style="margin:0; font-size:15px; line-height:1.7; color:#4b5563;">
              Thank you for shopping with Dajuvai.
            </p>

          </td>
        </tr>

        <!-- Divider -->
        <tr>
          <td style="padding:0 40px;">
            <hr style="border:none; border-top:1px solid #e5e7eb; margin:0;">
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 40px 32px; text-align:center;">
            <p style="margin:0; font-size:12px; color:#9ca3af;">
              This is an automated email from Dajuvai. Please do not reply to this message.
            </p>
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
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
        Thank you for your interest in becoming a vendor on <strong>Dajuvai</strong>. After reviewing your application, we regret to inform you that your application has not been approved at this time.
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

export const sendVendorApplicationEmail = async (
    to: string,
    businessName: string,
) => {
    const mailHtml = `
      <body style="margin:0; padding:0; background-color:#f4f5f7; font-family:Arial, Helvetica, sans-serif;">
                  <table role="presentation" width="100%"  cellpadding="0" cellspacing="0" style="background-color:#f4f5f7; padding:40px 0;">
                    <tr>
                      <td align="center">
                        <table role="presentation" width="550" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:6px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.06);">

                          <!-- Header / Brand -->
                          <tr>
                            <td style="background:linear-gradient(135deg,#ea580c,#f97316); padding:32px 40px; text-align:center;">
                              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                                <tr>
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
                              <h1 style="margin:0 0 8px 0; font-size:20px; color:#0f172a; font-weight:700;">Application Received</h1>
                              <p style="margin:0 0 24px 0; font-size:15px; line-height:1.6; color:#475569;">
                                Hi ${businessName},<br><br>
                                Thank you for applying to become a vendor on Dajuvai. We're excited about the possibility of partnering with you and appreciate the time you took to complete your application.
                              </p>

                              <!-- Status Box -->
                              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                <tr>
                                  <td align="center" style="background-color:#fff7ed; border:1px dashed #fdba74; border-radius:6px; padding:24px;">
                                    <div style="font-size:13px; color:#9a3412; text-transform:uppercase; letter-spacing:1px; margin-bottom:8px;">Application Status</div>
                                    <div style="font-size:22px; font-weight:800; color:#c2410c; letter-spacing:1px;">Under Review</div>
                                  </td>
                                </tr>
                              </table>

                              <!-- Info Notice -->
                              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff7ed; border-left:4px solid #ea580c; border-radius:4px; margin-bottom:24px;">
                                <tr>
                                  <td style="padding:12px 16px;">
                                    <p style="margin:0; font-size:13.5px; color:#9a3412; line-height:1.5;">
                                       Our team typically reviews new vendor applications within <strong>3–5 business days</strong>. We'll notify you by email as soon as a decision has been made.
                                    </p>
                                  </td>
                                </tr>
                              </table>

                              <p style="margin:0 0 16px 0; font-size:14px; line-height:1.6; color:#475569;">
                                Here's what happens next:
                              </p>

                              <!-- Steps List -->
                              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
                                <tr>
                                  <td style="padding:0 0 12px 0;">
                                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                                      <tr>
                                        <td width="28" valign="top" style="font-size:14px; color:#ea580c; font-weight:700;">1.</td>
                                        <td style="font-size:14px; line-height:1.6; color:#475569;">Our team reviews your submitted business details and documents.</td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                <tr>
                                  <td style="padding:0 0 12px 0;">
                                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                                      <tr>
                                        <td width="28" valign="top" style="font-size:14px; color:#ea580c; font-weight:700;">2.</td>
                                        <td style="font-size:14px; line-height:1.6; color:#475569;">We may reach out if we need any additional information from you.</td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                                <tr>
                                  <td>
                                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                                      <tr>
                                        <td width="28" valign="top" style="font-size:14px; color:#ea580c; font-weight:700;">3.</td>
                                        <td style="font-size:14px; line-height:1.6; color:#475569;">You'll receive an email confirming approval along with onboarding instructions.</td>
                                      </tr>
                                    </table>
                                  </td>
                                </tr>
                              </table>

                              <p style="margin:0 0 8px 0; font-size:14px; line-height:1.6; color:#475569;">
                                If you have any questions in the meantime, feel free to reach out to our vendor support team.
                              </p>
                              <p style="margin:0; font-size:14px; line-height:1.6; color:#475569;">
                                We look forward to the possibility of working with you.
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
  `;

    const mailOptions = {
        from: `<${config.USER_EMAIL}>`,
        to,
        subject: "Vendor Application Received",
        html: mailHtml,
    };

    await transporter.sendMail(mailOptions);
};

const getVendorOrderStatusEmailMeta = (status: string) => {
    const normalized = status.toUpperCase();
    const map: Record<
        string,
        { label: string; color: string; bg: string; copy: string }
    > = {
        ORDER_PLACED: {
            label: "Order Placed",
            color: "#92400e",
            bg: "#fef3c7",
            copy: "A new order has been placed for one of your products.",
        },
        PROCESSING: {
            label: "Processing",
            color: "#6d28d9",
            bg: "#ede9fe",
            copy: "This order is being prepared. Please ensure it is packed and ready for pickup.",
        },
        ARRIVED_AT_WAREHOUSE: {
            label: "At Warehouse",
            color: "#7c3aed",
            bg: "#ede9fe",
            copy: "This order has arrived at the warehouse.",
        },
        DELAYED: {
            label: "Delayed",
            color: "#be123c",
            bg: "#ffe4e6",
            copy: "This order is currently delayed. Please ensure it is fulfilled and dispatched as soon as possible.",
        },
        ASSIGNED_TO_RIDER: {
            label: "Out for Delivery",
            color: "#0369a1",
            bg: "#e0f2fe",
            copy: "This order has been handed to a delivery rider.",
        },
        DELIVERED: {
            label: "Delivered",
            color: "#047857",
            bg: "#d1fae5",
            copy: "This order has been successfully delivered to the customer.",
        },
        NOT_RECEIVED: {
            label: "Not Received",
            color: "#b45309",
            bg: "#fef3c7",
            copy: "The customer did not receive this order. Please check your dashboard for details.",
        },
        CANCELLED: {
            label: "Cancelled",
            color: "#b91c1c",
            bg: "#fee2e2",
            copy: "This order has been cancelled. Please do not fulfill this order if it hasn't been shipped yet.",
        },
        RETURNED: {
            label: "Returned",
            color: "#854d0e",
            bg: "#fef9c3",
            copy: "This order has been returned by the customer. Please expect the returned items.",
        },
    };

    return (
        map[normalized] ?? {
            label: normalized,
            color: "#334155",
            bg: "#e2e8f0",
            copy: "The status of this order has changed. Please check your dashboard for details.",
        }
    );
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

const buildAdminOrderEmailHtml = (
    data: AdminOrderEmailData,
    mode: "created" | "delivered",
): string => {

    const headerGradient =
        mode === "created"
            ? "linear-gradient(135deg, #ff7a1a, #ff9a3d)"
            : "linear-gradient(135deg, #059669, #10b981)";

    const emailTitle =
        mode === "created" ? "New Order Received" : "Order Delivered";

    const infoStripBg = mode === "created" ? "#fff4e9" : "#ecfdf5";
    const infoStripColor = mode === "created" ? "#7a4a1f" : "#065f46";
    const infoStripText =
        mode === "created"
            ? "A new order has been placed. Please review the details and begin processing. <strong>This is an internal admin notification.</strong>"
            : "The order has been successfully delivered to the customer. Delivery is complete. <strong>This is an internal completion notification.</strong>";


    const orderInfoRows = [
        { label: "Order ID", value: `#${escapeHtml(data.orderNumber)}` },
        { label: "Order Date", value: escapeHtml(data.orderDate) },
        { label: "Payment Method", value: escapeHtml(data.paymentMethod) },
        { label: "Payment Status", value: escapeHtml(data.paymentStatus) },
        { label: "Order Status", value: escapeHtml(data.orderStatus) },
    ]
        .map(
            (row) => `
        <tr>
          <td style="padding:10px 14px; width:160px; color:#888; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; background-color:#fafafa; border-bottom:1px solid #f0e3d8; font-weight:600;">${row.label}</td>
          <td style="padding:10px 14px; color:#2b2b2b; border-bottom:1px solid #f0e3d8; font-size:14px;">${row.value}</td>
        </tr>`,
        )
        .join("");


    const customerRows = [
        { label: "Full Name", value: escapeHtml(data.customer.fullName) },
        { label: "Email", value: escapeHtml(data.customer.email) },
        { label: "Phone", value: escapeHtml(data.customer.phone) },
        { label: "Shipping Address", value: escapeHtml(data.customer.address) },
        ...(data.customer.landmark
            ? [{ label: "Landmark", value: escapeHtml(data.customer.landmark) }]
            : []),
    ]
        .map(
            (row, idx, arr) => `
        <tr>
          <td style="padding:10px 14px; width:160px; color:#888; font-size:12px; text-transform:uppercase; letter-spacing:0.3px; background-color:#fafafa;${idx < arr.length - 1 ? " border-bottom:1px solid #f0e3d8;" : ""} font-weight:600;">${row.label}</td>
          <td style="padding:10px 14px; color:#2b2b2b; font-size:14px;${idx < arr.length - 1 ? " border-bottom:1px solid #f0e3d8;" : ""}">${row.value}</td>
        </tr>`,
        )
        .join("");

    const vendorSections = data.vendors
        .map((vendor) => {
            const productRows = vendor.items
                .map(
                    (item) => `
              <tr>
                <td style="padding:11px 10px; border-bottom:1px solid #f0e3d8; color:#2b2b2b; font-size:13.5px;">
                  <strong>${escapeHtml(item.name)}</strong>
                  ${item.sku ? `<br><span style="color:#999; font-size:11.5px;">SKU: ${escapeHtml(item.sku)}</span>` : ""}
                </td>
                <td style="padding:11px 10px; border-bottom:1px solid #f0e3d8; color:#555; font-size:13.5px;">
                  ${item.variant ? escapeHtml(item.variant) : '<span style="color:#bbb;">—</span>'}
                </td>
                <td style="padding:11px 10px; border-bottom:1px solid #f0e3d8; text-align:center; color:#555; font-size:13.5px;">${item.quantity}</td>
                <td style="padding:11px 10px; border-bottom:1px solid #f0e3d8; text-align:right; color:#555; font-size:13.5px;">Rs ${Number(item.unitPrice).toFixed(2)}</td>
                <td style="padding:11px 10px; border-bottom:1px solid #f0e3d8; text-align:right; color:#2e7d32; font-size:13.5px;">
                  ${item.discount && item.discount > 0 ? `-Rs ${Number(item.discount).toFixed(2)}` : '<span style="color:#bbb;">—</span>'}
                </td>
                <td style="padding:11px 10px; border-bottom:1px solid #f0e3d8; text-align:right; font-weight:700; color:#2b2b2b; font-size:13.5px;">Rs ${Number(item.lineTotal).toFixed(2)}</td>
              </tr>`,
                )
                .join("");

            return `
          <!-- Vendor Section: ${escapeHtml(vendor.name)} -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:28px; border:1px solid #e8d8c4; border-radius:8px; overflow:hidden;">
            <!-- Vendor info row (single line) -->
            <tr>
              <td colspan="6" style="padding:12px 16px; border-bottom:1px solid #f0e3d8; background:#fff4e9;">
                <span style="font-size:13px; color:#2b2b2b;">
                  <strong>${escapeHtml(vendor.name)}</strong>
                  <span style="color:#888; margin:0 8px;">|</span> <strong>${escapeHtml(vendor.district)}</strong>
                  <span style="color:#888; margin:0 8px;">|</span> <strong>${escapeHtml(vendor.email)}</strong>
                  <span style="color:#888; margin:0 8px;">|</span> <strong>${escapeHtml(vendor.phone)}</strong>
                </span>
              </td>
            </tr>
           
            <!-- Product table header -->
            <tr style="background-color:#f5f5f5;">
              <th style="padding:10px 10px; text-align:left; font-size:11.5px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8; font-weight:700;">Product</th>
              <th style="padding:10px 10px; text-align:left; font-size:11.5px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8; font-weight:700;">Variant</th>
              <th style="padding:10px 10px; text-align:center; font-size:11.5px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8; font-weight:700;">Qty</th>
              <th style="padding:10px 10px; text-align:right; font-size:11.5px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8; font-weight:700;">Unit Price</th>
              <th style="padding:10px 10px; text-align:right; font-size:11.5px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8; font-weight:700;">Discount</th>
              <th style="padding:10px 10px; text-align:right; font-size:11.5px; text-transform:uppercase; letter-spacing:0.3px; color:#888; border-bottom:1px solid #f0e3d8; font-weight:700;">Total</th>
            </tr>
            <tbody>
              ${productRows}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="5" style="padding:12px 10px; text-align:right; font-weight:700; color:#2b2b2b; background-color:#fafafa; border-top:1px solid #f0e3d8;">Vendor Total:</td>
                <td style="padding:12px 10px; text-align:right; font-weight:700; color:#c05a00; background-color:#fafafa; border-top:1px solid #f0e3d8;">Rs ${Number(vendor.subtotal).toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>`;
        })
        .join("");

    const hasDiscount = data.discountTotal > 0;

    // -- Vendor Subtotal section rows (one per vendor) --
    const vendorSubtotalRows = data.vendors
        .map(
            (v) => `
        <tr>
          <td style="padding:7px 14px; color:#555; font-size:13.5px;">${escapeHtml(v.name)}</td>
          <td style="padding:7px 14px; text-align:right; color:#2b2b2b; font-size:13.5px;">Rs ${Number(v.subtotal).toFixed(2)}</td>
        </tr>`,
        )
        .join("");

    const totalVendorSubtotal = hasDiscount && data.promoApplyOn !== "SHIPPING"
        ? data.subtotal - data.discountTotal
        : data.subtotal;

    // -- Shipping Fees by Vendor section rows --
    const shippingByVendorRows = data.vendors
        .map(
            (v) => `
        <tr>
          <td style="padding:7px 14px; color:#555; font-size:13.5px;">${escapeHtml(v.name)}, ${escapeHtml(v.district)}</td>
          <td style="padding:7px 14px; text-align:right; color:#2b2b2b; font-size:13.5px;">Rs ${Number(v.shippingFee).toFixed(2)}</td>
        </tr>`,
        )
        .join("");

    const totalShipping = hasDiscount && data.promoApplyOn === "SHIPPING"
        ? data.shippingTotal - data.discountTotal
        : data.shippingTotal;

    return `
<body style="margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; background-color:#f4f4f4;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table width="760" cellpadding="0" cellspacing="0" border="0" style="max-width:95%; background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 10px rgba(0,0,0,0.06);">

          <!-- ── Header ── -->
          <tr>
            <td style="background:${headerGradient}; padding:28px 30px; text-align:center;">
              <div style="font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:rgba(255,255,255,0.7); margin-bottom:6px;">DajuVai Admin Notification</div>
              <h1 style="color:#ffffff; margin:0; font-size:24px; letter-spacing:0.4px;">${escapeHtml(emailTitle)}</h1>
            </td>
          </tr>

          <!-- ── Body ── -->
          <tr>
            <td style="padding:30px;">

              <!-- ── Order Information ── -->
              <h3 style="margin:0 0 12px; font-size:15px; color:#2b2b2b; border-left:4px solid #ff7a1a; padding-left:10px;">Order Information</h3>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:28px; border:1px solid #e8d8c4; border-radius:8px; overflow:hidden;">
                <tbody>
                  ${orderInfoRows}
                </tbody>
              </table>

              <!-- ── Customer Information ── -->
              <h3 style="margin:0 0 12px; font-size:15px; color:#2b2b2b; border-left:4px solid #ff7a1a; padding-left:10px;">Customer Information</h3>
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:28px; border:1px solid #e8d8c4; border-radius:8px; overflow:hidden;">
                <tbody>
                  ${customerRows}
                </tbody>
              </table>

              <!-- ── Vendor Sections ── -->
              <h3 style="margin:0 0 16px; font-size:15px; color:#2b2b2b; border-left:4px solid #ff7a1a; padding-left:10px;">Order Items by Vendor</h3>
              ${vendorSections}

              <!-- ── Price Summary ── -->
              <h3 style="margin:0 0 12px; font-size:15px; color:#2b2b2b; border-left:4px solid #ff7a1a; padding-left:10px;">Price Summary</h3>

              <!-- Section 1: Vendor Subtotal -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:16px; border:1px solid #e8d8c4; border-radius:8px; overflow:hidden;">
                <tr>
                  <td colspan="2" style="padding:10px 14px; background-color:#fff4e9; border-bottom:2px solid #ff7a1a;">
                    <span style="font-size:12px; font-weight:700; color:#c05a00; text-transform:uppercase; letter-spacing:0.4px;">Vendor Wise Order Subtotal</span>
                  </td>
                </tr>
                <tbody>
                  ${vendorSubtotalRows}
                  ${
                      hasDiscount && data.promoApplyOn !== "SHIPPING"
                          ? `<tr>
                    <td style="padding:8px 14px; color:#2e7d32; font-size:13.5px;">Promo Code (${escapeHtml(data.appliedPromoCode || "")})</td>
                    <td style="padding:8px 14px; text-align:right; color:#2e7d32; font-size:13.5px;">-Rs ${Number(data.discountTotal).toFixed(2)}</td>
                  </tr>`
                          : ""
                  }
                </tbody>
                <tfoot>
                  <tr>
                    <td style="padding:10px 14px; font-weight:700; color:#2b2b2b; font-size:13.5px; background-color:#fafafa; border-top:1px solid #f0e3d8;">Order Subtotal</td>
                    <td style="padding:10px 14px; text-align:right; font-weight:700; color:#c05a00; font-size:13.5px; background-color:#fafafa; border-top:1px solid #f0e3d8;">Rs ${Number(totalVendorSubtotal).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>

              <!-- Section 2: Shipping Fees by Vendor -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:16px; border:1px solid #e8d8c4; border-radius:8px; overflow:hidden;">
                <tr>
                  <td colspan="2" style="padding:10px 14px; background-color:#fff4e9; border-bottom:2px solid #ff7a1a;">
                    <span style="font-size:12px; font-weight:700; color:#c05a00; text-transform:uppercase; letter-spacing:0.4px;">Shipping Fees by Vendor</span>
                  </td>
                </tr>
                <tbody>
                  ${shippingByVendorRows}
                  ${
                      hasDiscount && data.promoApplyOn === "SHIPPING"
                          ? `<tr>
                    <td style="padding:8px 14px; color:#2e7d32; font-size:13.5px;">Promo Code (${escapeHtml(data.appliedPromoCode || "")})</td>
                    <td style="padding:8px 14px; text-align:right; color:#2e7d32; font-size:13.5px;">-Rs ${Number(data.discountTotal).toFixed(2)}</td>
                  </tr>`
                          : ""
                  }
                </tbody>
                <tfoot>
                  <tr>
                    <td style="padding:10px 14px; font-weight:700; color:#2b2b2b; font-size:13.5px; background-color:#fafafa; border-top:1px solid #f0e3d8;">Total Shipping</td>
                    <td style="padding:10px 14px; text-align:right; font-weight:700; color:#c05a00; font-size:13.5px; background-color:#fafafa; border-top:1px solid #f0e3d8;">Rs ${Number(totalShipping).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>

              <!-- Section 3: Grand Total -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-bottom:6px; border:1px solid #e8d8c4; border-radius:8px; overflow:hidden;">
                <tr>
                  <td colspan="2" style="padding:10px 14px; background-color:#fff4e9; border-bottom:2px solid #ff7a1a;">
                    <span style="font-size:12px; font-weight:700; color:#c05a00; text-transform:uppercase; letter-spacing:0.4px;">Grand Total</span>
                  </td>
                </tr>
                <tbody>
                  <tr>
                    <td style="padding:8px 14px; color:#555; font-size:13.5px;">Order Subtotal</td>
                    <td style="padding:8px 14px; text-align:right; color:#2b2b2b; font-size:13.5px;">Rs ${Number(totalVendorSubtotal).toFixed(2)}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 14px; color:#555; font-size:13.5px;">Total Shipping</td>
                    <td style="padding:8px 14px; text-align:right; color:#2b2b2b; font-size:13.5px;">Rs ${Number(totalShipping).toFixed(2)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <td style="padding:14px; border-top:2px solid #ff7a1a; font-weight:700; font-size:15px; color:#2b2b2b;">Grand Total</td>
                    <td style="padding:14px; border-top:2px solid #ff7a1a; text-align:right; font-weight:700; font-size:15px; color:#ff7a1a;">Rs ${Number(data.grandTotal).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>

            </td>
          </tr>

          <!-- ── Footer ── -->
          <tr>
            <td style="padding:20px 30px; border-top:1px solid #eee; font-size:12px; color:#999; text-align:center;">
              This is an automated internal notification sent to administrators only. Please do not reply to this email.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>`;
};


export const sendAdminOrderCreatedEmail = async (
    to: string,
    data: AdminOrderEmailData,
): Promise<void> => {
    await transporter.sendMail({
        from: `<${config.USER_EMAIL}>`,
        to,
        subject: `New Order Received - #${data.orderNumber}`,
        html: buildAdminOrderEmailHtml(data, "created"),
    });
};

export const sendAdminOrderDeliveredEmail = async (
    to: string,
    data: AdminOrderEmailData,
): Promise<void> => {
    await transporter.sendMail({
        from: `<${config.USER_EMAIL}>`,
        to: "samippoudelcsit080@chitwancollege.edu.np",
        subject: `Order Delivered - #${data.orderNumber}`,
        html: buildAdminOrderEmailHtml(data, "delivered"),
    });
};

export const sendVendorOrderStatusEmail = async (
    to: string,
    orderNumber: string,
    status: string,
    subject?: string,
) => {
    const statusMeta = getVendorOrderStatusEmailMeta(status);
    const orderLabel = `#${orderNumber}`;

    await transporter.sendMail({
        from: `<${config.USER_EMAIL}>`,
        to,
        subject: subject || `Update for Order ${orderLabel}: ${statusMeta.label}`,
        html: `
            <div style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#111827;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f4f4f4;">
                    <tr>
                        <td align="center" style="padding:24px 12px;">
                            <table role="presentation" width="700" cellspacing="0" cellpadding="0" style="max-width:95%;border-collapse:collapse;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.06);">

                                <!-- Header -->
                                <tr>
                                    <td style="background:linear-gradient(135deg, #ff7a1a, #ff9a3d);padding:28px 30px;text-align:center;">
                                        <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#fff2e6;">Vendor Order Update</div>
                                        <h1 style="margin:8px 0 0;color:#ffffff;font-size:22px;letter-spacing:0.4px;">Order is ${escapeHtml(statusMeta.label)}</h1>
                                    </td>
                                </tr>

                                <!-- Body -->
                                <tr>
                                    <td style="padding:30px;">
                                        <p style="font-size:15px;color:#333;margin:0 0 24px;">${escapeHtml(statusMeta.copy)}</p>

                                        <!-- Order Status -->
                                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:24px;border:1px solid #f0e3d8;border-radius:8px;overflow:hidden;">
                                            <tr style="background-color:#fafafa;">
                                                <td style="padding:16px 18px;border-bottom:1px solid #f0e3d8;">
                                                    <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#888;">Order Number</div>
                                                    <div style="margin-top:5px;font-size:18px;font-weight:800;color:#2b2b2b;">${escapeHtml(orderLabel)}</div>
                                                </td>
                                                <td align="right" style="padding:16px 18px;border-bottom:1px solid #f0e3d8;">
                                                    <span style="display:inline-block;padding:8px 13px;border-radius:999px;background:${statusMeta.bg};color:${statusMeta.color};font-size:12px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;">${escapeHtml(statusMeta.label)}</span>
                                                </td>
                                            </tr>
                                        </table>

                                        <p style="margin:22px 0 0;font-size:13px;line-height:1.6;color:#888;">Please check your vendor dashboard for more details.</p>
                                    </td>
                                </tr>

                                <!-- Info strip -->
                                <tr>
                                    <td style="padding:18px 30px;background-color:#fff4e9;font-size:14px;color:#7a4a1f;">
                                        You can log in to your vendor dashboard to manage this and other orders.
                                    </td>
                                </tr>

                                <!-- Footer -->
                                <tr>
                                    <td style="padding:20px 30px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center;">
                                        This is an automated notification sent to registered vendors. Please do not reply to this email.
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
