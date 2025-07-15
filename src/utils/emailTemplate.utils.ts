import { ContactInput } from "./zod_validations/contact.zod";

export const generateVerificationEmailHTML = (verificationLink: string, token: number) => {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Email Verification</title>
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; line-height: 1.6; background-color: #f4f4f4; color: #333333;">

            <div style="max-width: 600px; margin: 20px auto; padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">

                <!-- Header -->
                <header style="text-align: center; padding: 20px 0; border-bottom: 1px solid #eee;">
                    <h1 style="color: #333333; margin: 0; font-size: 24px; font-weight: bold;">Verify Your Account</h1>
                </header>

                <!-- Main Content -->
                <main style="padding: 20px;">
                    <p style="color: #666666; margin: 20px 0; font-size: 16px; line-height: 1.5;">
                        Thank you for registering! Please click the button below to verify your email address:
                    </p>

                    <!-- Verification Button -->
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${verificationLink}" style="display: inline-block; padding: 14px 28px; background-color: #007BFF; color: #ffffff; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; border: 1px solid #007BFF; transition: background-color 0.3s;">
                            Verify Email
                        </a>
                    </div>

                    <!-- Token Information -->
                    <p style="color: #666666; font-size: 14px; margin-top: 20px; line-height: 1.5;">
                        Your verification token is: <strong>${token}</strong>. Please keep this token safe.
                    </p>

                    <!-- Note (Optional) -->
                    <p style="color: #999999; font-size: 14px; margin-top: 20px; line-height: 1.5;">
                        If you didn’t request this email, please ignore it or contact our support team.
                    </p>
                </main>

                <!-- Footer -->
                <footer style="text-align: center; color: #999999; font-size: 12px; margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">
                    © ${new Date().getFullYear()} Your Company Name. All rights reserved. | 
                    <a href="mailto:support@yourcompany.com" style="color: #999999; text-decoration: none;">Support</a>
                </footer>

            </div>

        </body>
        </html>
    `;
};


export const generateContactEmailHTML = (dto: ContactInput) => {
    return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <title>Contact Form Submission</title>
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; line-height: 1.6; background-color: #f4f4f4; color: #333333;">
            <div style="max-width: 600px; margin: 20px auto; padding: 20px; background-color: #ffffff; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1);">
                <!-- Header -->
                <header style="text-align: center; padding: 20px 0; border-bottom: 1px solid #eee;">
                    <h1 style="color: #333333; margin: 0; font-size: 24px; font-weight: bold;">New Contact Form Submission</h1>
                </header>
                <!-- Main Content -->
                <main style="padding: 20px;">
                    <p style="color: #666666; margin: 10px 0; font-size: 16px; line-height: 1.5;">
                        <strong>First Name:</strong> ${dto.firstName}
                    </p>
                    <p style="color: #666666; margin: 10px 0; font-size: 16px; line-height: 1.5;">
                        <strong>Last Name:</strong> ${dto.lastName}
                    </p>
                    <p style="color: #666666; margin: 10px 0; font-size: 16px; line-height: 1.5;">
                        <strong>Email:</strong> ${dto.email}
                    </p>
                    ${dto.phone ? `
                        <p style="color: #666666; margin: 10px 0; font-size: 16px; line-height: 1.5;">
                            <strong>Phone:</strong> ${dto.phone}
                        </p>
                    ` : ''}
                    <p style="color: #666666; margin: 10px 0; font-size: 16px; line-height: 1.5;">
                        <strong>Subject:</strong> ${dto.subject}
                    </p>
                    <p style="color: #666666; margin: 10px 0; font-size: 16px; line-height: 1.5;">
                        <strong>Message:</strong> ${dto.message}
                    </p>
                </main>
                <!-- Footer -->
                <footer style="text-align: center; color: #999999; font-size: 12px; margin-top: 20px; border-top: 1px solid #eee; padding-top: 15px;">
                    © ${new Date().getFullYear()} Leaflet digital. All rights reserved. | 
                </footer>
            </div>
        </body>
        </html>
    `;
};