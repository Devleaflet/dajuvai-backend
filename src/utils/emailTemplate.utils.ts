import { ContactInput } from "./zod_validations/contact.zod";
import { detailsTable, emailLayout, esc, heading, notice } from "./emailLayout.utils";

/** The contact form, as it lands in the support inbox. Reply goes to the visitor. */
export const generateContactEmailHTML = (dto: ContactInput) => {
    const name = [dto.firstName, dto.lastName].filter(Boolean).join(" ");
    return emailLayout({
        preheader: `${name || dto.email}: ${dto.subject}`,
        eyebrow: "Contact form",
        title: dto.subject,
        html: [
            detailsTable([
                ["From", name],
                ["Email", dto.email],
                ["Phone", dto.phone],
            ]),
            heading("Message"),
            notice(esc(dto.message).replace(/\r?\n/g, "<br>"), "neutral"),
        ].join(""),
        footerNote: "Sent from the contact form on DajuVai. Reply to this email to answer the customer directly.",
    });
};
