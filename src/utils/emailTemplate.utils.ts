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
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f9fafb; color: #333333;">
            <div style="max-width: 650px; margin: 30px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 6px 18px rgba(0,0,0,0.08);">
                
                <!-- Header -->
                <header style="background: linear-gradient(135deg, #4cafef, #0077b6); color: #ffffff; text-align: center; padding: 25px;">
                    <h1 style="margin: 0; font-size: 26px; font-weight: 700;">📩 New Contact Submission</h1>
                    <p style="margin: 8px 0 0; font-size: 14px; opacity: 0.9;">A visitor just reached out via the website contact form.</p>
                </header>

                <!-- Main Content -->
                <main style="padding: 25px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tbody>
                            <tr>
                                <td style="padding: 10px; font-weight: bold; color: #222;">First Name:</td>
                                <td style="padding: 10px; color: #555;">${dto.firstName}</td>
                            </tr>
                            <tr style="background-color: #f9f9f9;">
                                <td style="padding: 10px; font-weight: bold; color: #222;">Last Name:</td>
                                <td style="padding: 10px; color: #555;">${dto.lastName}</td>
                            </tr>
                            <tr>
                                <td style="padding: 10px; font-weight: bold; color: #222;">Email:</td>
                                <td style="padding: 10px; color: #555;">${dto.email}</td>
                            </tr>
                            ${dto.phone
            ? `
                                <tr style="background-color: #f9f9f9;">
                                    <td style="padding: 10px; font-weight: bold; color: #222;">Phone:</td>
                                    <td style="padding: 10px; color: #555;">${dto.phone}</td>
                                </tr>
                                `
            : ''
        }
                            <tr>
                                <td style="padding: 10px; font-weight: bold; color: #222;">Subject:</td>
                                <td style="padding: 10px; color: #555;">${dto.subject}</td>
                            </tr>
                        </tbody>
                    </table>

                    <!-- Message -->
                    <div style="margin-top: 20px; padding: 15px; background-color: #f1f8ff; border-left: 4px solid #0077b6; border-radius: 6px;">
                        <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #333;">
                            ${dto.message}
                        </p>
                    </div>
                </main>

                <!-- Footer -->
                <footer style="text-align: center; background-color: #f9fafb; padding: 15px; font-size: 12px; color: #888; border-top: 1px solid #eee;">
                    <p style="margin: 5px 0;">© ${new Date().getFullYear()} <strong>Leaflet Digital</strong>. All rights reserved.</p>
                    <p style="margin: 5px 0; font-size: 11px;">This email was generated automatically. Please do not reply.</p>
                </footer>
            </div>
        </body>
        </html>
    `;
};
