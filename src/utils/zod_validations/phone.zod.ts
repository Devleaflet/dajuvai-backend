import { z } from "zod";

/**
 * A Nepali phone number, stored as its 10 national digits.
 *
 * Shoppers type it every way a phone shows it: with the +977 country code,
 * with spaces or dashes. Those are normalised away rather than rejected, and
 * the result must be exactly 10 digits — the same rule checkout, delivery and
 * vendor sign-up enforce, so a number saved on a profile also works at
 * checkout (QA BUG-016).
 */
export const nepalPhoneNumberSchema = z
    .string()
    .transform((value) => value.replace(/[\s-]/g, "").replace(/^\+?977(?=\d{10}$)/, ""))
    .pipe(z.string().regex(/^\d{10}$/, "Enter a 10-digit phone number, e.g. 98XXXXXXXX"));
