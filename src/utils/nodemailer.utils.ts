import nodemailer from "nodemailer";
import { config } from "dotenv";
import { ContactInput } from "./zod_validations/contact.zod";
import { generateContactEmailHTML } from "./emailTemplate.utils";

config(); // Load environment variables from .env

// Configure nodemailer transporter with Gmail SMTP using credentials from env
const transporter = nodemailer.createTransport({
  service: "Gmail",
  auth: {
    user: process.env.USER_EMAIL, // Your Gmail email address
    pass: process.env.PASS_EMAIL  // App password or actual password (prefer app password for security)
  }
});

/**
 * Sends an email when the contact form is submitted.
 * @param dto - ContactInput object validated by Zod with form data (name, email, subject, message)
 */
export const sendContactEmail = async (dto: ContactInput) => {
  // Email options including recipient, subject, and HTML body generated from dto
  const mailOptions = {
    from: `${dto.email}`, // sender address with friendly name
    to: `${process.env.USER_EMAIL}`,                       // support or admin email address
    subject: `New Contact Form Submission: ${dto.subject}`, // email subject line
    html: generateContactEmailHTML(dto),                // formatted HTML content of the message
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
export const sendVerificationEmail = async (to: string, sub: string, token?: string) => {
  const loginUrl = "https://dev.api.dajuvai.com/api/vendors/login"
  const mailOptions = {
    from: `<${process.env.USER_EMAIL}>`,
    to,
    subject: sub,
    html: `
        <div>
            ${token ? `
                <h2>Email Verification</h2>
                <p>Your 6-digit verification code is:</p>
                <h3>${token}</h3>
                <p>This code will expire in 2 minutes</p>
            ` : `
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
            `}
        </div>
    `
  };


  // Send the verification email
  await transporter.sendMail(mailOptions);
};


export const sendCustomerOrderEmail = async (
  to: string,
  orderId: number,
  items: {
    name: string;
    sku?: string | null;
    quantity: number;
    price: number;
    variantAttributes?: Record<string, string> | null;
  }[],
  subject = "Your Order Has Been Placed"
) => {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Generate rows dynamically
  const rows = items.map(
    (item) => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${item.name}${item.sku ? ` (${item.sku})` : ""
      }</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${item.variantAttributes
        ? Object.entries(item.variantAttributes)
          .map(([key, val]) => `${key}: ${val}`)
          .join(", ")
        : "-"
      }</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.quantity
      }</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">Rs ${item.price}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">Rs ${(
        item.price * item.quantity
      ).toFixed(2)}</td>
      </tr>
    `
  );

  const mailOptions = {
    from: `<${process.env.USER_EMAIL}>`,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 700px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
        <h2 style="color: #2E7D32; text-align: center;">Order Confirmation ✅</h2>
        <p style="font-size: 16px; text-align: center;">
          Thank you for your order! Your order <strong>#${orderId}</strong> has been successfully placed.
        </p>

        <h3 style="margin-top: 20px;">Order Summary</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
          <thead>
            <tr style="background-color: #f0f0f0;">
              <th style="padding: 8px; border: 1px solid #ddd;">Product</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Variant</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Qty</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Price</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${rows.join("")}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">Total:</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">Rs ${total.toFixed(
      2
    )}</td>
            </tr>
          </tfoot>
        </table>

        <p style="margin-top: 20px; font-size: 14px;">
          We are processing your order and will notify you once it has been shipped.
        </p>

        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="font-size: 12px; color: #888; text-align: center;">
          If you did not place this order or have any concerns, please contact our support team immediately.
        </p>
      </div>
    `
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
  products: VendorOrderItem[],
  customer: CustomerInfo,
  subject = "New Order Received"
) => {
  // Generate HTML rows for each product
  const productList = products.map(item => {
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
  }).join("");

  // Calculate total price
  const totalPrice = products.reduce((sum, item) => sum + item.price * item.quantity, 0);

  // Combine address fields into a single string
  const fullAddress = [
    customer.localAddress,
    customer.landmark,
    customer.city,
    customer.district
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

      <!-- Total -->
      <p style="text-align: right; font-size: 16px; margin-bottom: 30px;">
        <strong>Total: Rs ${totalPrice.toFixed(2)}</strong>
      </p>

      <!-- Footer -->
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
      <p style="font-size: 13px; text-align: center; color: #666;">
        This is an automated notification. Contact support if there are any issues with this order.
      </p>
    </div>
  `;

  // Send email
  await transporter.sendMail({
    from: `<${process.env.USER_EMAIL}>`,
    to,
    subject,
    html: mailHtml
  });
};


export const sendOrderStatusEmail = async (
  to: string,
  orderId: number,
  status: string,
  subject = "Your Order Status Has Been Updated"
) => {
  const mailOptions = {
    from: `<${process.env.USER_EMAIL}>`,
    to,
    subject,
    html: `
      <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #e3f2fd;">
        <h2 style="color: #1976d2; text-align: center;">Order Update 📦</h2>
        
        <p style="font-size: 16px; text-align: center;">
          The status of your order <strong>#${orderId}</strong> has been updated.
        </p>
        
        <div style="text-align: center; margin: 20px 0;">
          <span style="display: inline-block; padding: 10px 20px; border-radius: 6px; background-color: #1976d2; color: white; font-size: 16px; font-weight: bold;">
            ${status.toUpperCase()}
          </span>
        </div>

        <p style="font-size: 16px; text-align: center;">
          You can track your order in your account for more details.
        </p>
        
        <div style="text-align: center; margin-top: 20px;">
          <a href="${process.env.FRONTEND_URL}/orders/${orderId}" 
             style="display: inline-block; padding: 10px 18px; border-radius: 6px; background-color: #388e3c; color: white; text-decoration: none; font-weight: bold;">
            View Order
          </a>
        </div>
        
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        
        <p style="font-size: 12px; color: #888; text-align: center;">
          If you have any questions, please contact our support team.
        </p>
      </div>
    `
  };

  await transporter.sendMail(mailOptions);
};
