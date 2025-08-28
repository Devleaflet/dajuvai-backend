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
        from: `"Contact Form" <${process.env.USER_EMAIL}>`, // sender address with friendly name
        to: `${dto.email}`,                       // support or admin email address
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


export const sendCustomerOrderEmail = async (to: string, orderId: number, subject = "Your Order Has Been Placed") => {
    const mailOptions = {
        from: `<${process.env.USER_EMAIL}>`,
        to,
        subject,
        html: `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #f9f9f9;">
            <h2 style="color: #2E7D32; text-align: center;">Order Confirmation ✅</h2>
            <p style="font-size: 16px; text-align: center;">
                Thank you for your order! Your order <strong>#${orderId}</strong> has been successfully placed.
            </p>
            <p style="font-size: 16px; text-align: center;">
                We are processing your order and will notify you once it has been shipped.
            </p>
            <p style="font-size: 16px; text-align: center;">
                You can track your order and manage your account by logging into your account.
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



export const sendVendorOrderEmail = async (to: string, orderId: number, products: { quantity: number }[], subject = "New Order Received") => {
    const productList = products.map(p => `<li> x ${p.quantity}</li>`).join("");

    const mailOptions = {
        from: `<${process.env.USER_EMAIL}>`,
        to,
        subject,
        html: `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background-color: #fff3e0;">
            <h2 style="color: #EF6C00; text-align: center;">New Order Received 🛒</h2>
            <p style="font-size: 16px; text-align: center;">
                You have received a new order <strong>#${orderId}</strong>.
            </p>
            <p style="font-size: 16px;">Order details:</p>
            <ul>
                ${productList}
            </ul>
            <p style="font-size: 16px;">
                Please process and ship the order promptly.
            </p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="font-size: 12px; color: #888; text-align: center;">
                Contact support if you notice any issues with this order.
            </p>
        </div>
        `
    };

    await transporter.sendMail(mailOptions);
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
