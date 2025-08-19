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
<body style="margin:0; padding:0; font-family: 'Segoe UI', Arial, sans-serif; background-color:#f7f9fc; color:#333333;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
    <tr>
      <td align="center" style="padding: 30px 15px;">
        <table style="max-width:600px; width:100%; background-color:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 12px rgba(0,0,0,0.08);" cellpadding="0" cellspacing="0" border="0">
          
          <!-- Header -->
          <tr>
            <td align="center" style="background:linear-gradient(135deg, #4a90e2, #0073e6); padding:30px;">
              <h1 style="margin:0; font-size:22px; font-weight:600; color:#ffffff; font-family: 'Segoe UI', Arial, sans-serif;">
                📩 New Contact Form Submission
              </h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding:30px;">
              <p style="margin:0 0 15px; font-size:16px; color:#555555; line-height:1.5;">
                You’ve received a new contact form submission. Details are below:
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px; border-collapse:collapse;">
                <tr>
                  <td style="padding:10px 0; font-weight:600; width:150px; color:#222;">First Name:</td>
                  <td style="padding:10px 0; color:#555;">${dto.firstName}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0; font-weight:600; color:#222;">Last Name:</td>
                  <td style="padding:10px 0; color:#555;">${dto.lastName}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0; font-weight:600; color:#222;">Email:</td>
                  <td style="padding:10px 0; color:#555;">${dto.email}</td>
                </tr>
                ${dto.phone ? `
                <tr>
                  <td style="padding:10px 0; font-weight:600; color:#222;">Phone:</td>
                  <td style="padding:10px 0; color:#555;">${dto.phone}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding:10px 0; font-weight:600; color:#222;">Subject:</td>
                  <td style="padding:10px 0; color:#555;">${dto.subject}</td>
                </tr>
                <tr>
                  <td style="padding:10px 0; font-weight:600; color:#222; vertical-align:top;">Message:</td>
                  <td style="padding:10px 0; color:#555;">${dto.message}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background:#f0f4f8; padding:15px; font-size:13px; color:#777;">
              This email was generated automatically from your website contact form.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>

    `;
};