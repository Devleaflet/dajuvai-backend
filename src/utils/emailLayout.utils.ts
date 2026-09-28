import config from "../config/env.config";

/**
 * The one look every DajuVai email shares.
 *
 * Table-based and inline-styled because that is what email clients render;
 * the single <style> block only adds the phone-width tweaks that clients
 * supporting media queries (Gmail, Apple Mail, iOS, Android) apply. Everything
 * reads correctly without it.
 *
 * Every value a caller passes as *text* is escaped here. Parameters named
 * `html` are trusted markup built by these helpers — never user input.
 */

const BRAND = "#f97316";
const BRAND_DARK = "#c2410c";
const INK = "#18181b";
const BODY = "#3f3f46";
const MUTED = "#71717a";
const LINE = "#e4e4e7";
const SURFACE = "#fafafa";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export type EmailTone = "neutral" | "info" | "success" | "warning" | "danger" | "brand";

const TONES: Record<EmailTone, { bg: string; fg: string; border: string }> = {
    neutral: { bg: "#f4f4f5", fg: "#3f3f46", border: "#d4d4d8" },
    info: { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" },
    success: { bg: "#ecfdf5", fg: "#047857", border: "#a7f3d0" },
    warning: { bg: "#fffbeb", fg: "#b45309", border: "#fde68a" },
    danger: { bg: "#fef2f2", fg: "#b91c1c", border: "#fecaca" },
    brand: { bg: "#fff7ed", fg: BRAND_DARK, border: "#fed7aa" },
};

export const esc = (value: unknown): string =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

/** Escaped text with its line breaks kept. */
export const escLines = (value: unknown): string => esc(value).replace(/\r?\n/g, "<br>");

export const money = (value: unknown): string =>
    `Rs ${(Number(value) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const appUrl = (path = ""): string => `${config.FRONTEND_URL.replace(/\/$/, "")}${path}`;

export function paragraph(text: string): string {
    return `<p style="margin:0 0 16px;font-size:15px;line-height:1.65;color:${BODY};">${escLines(text)}</p>`;
}

export function heading(text: string): string {
    return `<h2 style="margin:28px 0 12px;font-size:13px;line-height:1.4;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${MUTED};">${esc(text)}</h2>`;
}

export function button(label: string, href: string): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr><td style="border-radius:8px;background:${BRAND};"><a href="${esc(href)}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(label)}</a></td></tr></table>`;
}

export function pill(label: string, tone: EmailTone = "neutral"): string {
    const t = TONES[tone];
    return `<span style="display:inline-block;padding:5px 11px;border-radius:999px;background:${t.bg};border:1px solid ${t.border};color:${t.fg};font-size:12px;font-weight:700;line-height:1.2;white-space:nowrap;">${esc(label)}</span>`;
}

/** A tinted callout. `html` is trusted markup; use `esc` for anything typed by a person. */
export function notice(html: string, tone: EmailTone = "brand", title?: string): string {
    const t = TONES[tone];
    return `<table role="presentation" class="dv-full" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;margin:0 0 20px;border-collapse:separate;"><tr><td class="dv-tint" style="padding:14px 16px;background:${t.bg};border:1px solid ${t.border};border-radius:10px;font-size:14px;line-height:1.6;color:${t.fg};">${title ? `<strong style="display:block;margin:0 0 4px;font-size:14px;">${esc(title)}</strong>` : ""}${html}</td></tr></table>`;
}

/** Label/value rows — order facts, customer details. Values are escaped. */
export function detailsTable(rows: Array<[string, string | number | null | undefined]>): string {
    const shown = rows.filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "");
    const cells = shown
        .map(
            ([label, value], i) =>
                `<tr><td class="dv-label dv-cell" style="padding:11px 14px;width:38%;font-size:13px;color:${MUTED};vertical-align:top;${i ? `border-top:1px solid ${LINE};` : ""}">${esc(label)}</td><td class="dv-cell" style="padding:11px 14px;font-size:14px;color:${INK};vertical-align:top;${i ? `border-top:1px solid ${LINE};` : ""}">${escLines(value)}</td></tr>`,
        )
        .join("");
    return `<table role="presentation" class="dv-full dv-box" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;margin:0 0 20px;border:1px solid ${LINE};border-radius:10px;border-collapse:separate;">${cells}</table>`;
}

export interface EmailLineItem {
    name: string;
    /** Secondary facts under the name: variant, SKU. */
    details?: Array<string | null | undefined>;
    /** Short highlighted labels: a discount name, a deal. */
    tags?: Array<string | null | undefined>;
    quantity: number;
    unitPrice: number;
    /** Price before discounts, shown struck through when higher. */
    originalUnitPrice?: number | null;
    lineTotal?: number;
}

export interface ItemsTableFooterRow {
    label: string;
    amount: number;
    /** The block's own total: bold, above a rule. */
    total?: boolean;
    /** A deduction, shown in green with a minus. */
    discount?: boolean;
}

/**
 * Order lines as two columns — the item with its quantity and unit price
 * underneath, and the line total — so it stays readable on a phone instead of
 * squeezing five columns into 320px.
 *
 * With a `title` it is one seller's block: their name, a subtitle (where it
 * ships from, when it arrives), their items, then their own subtotal,
 * shipping and total in the footer.
 */
export function itemsTable(
    items: EmailLineItem[],
    options: { title?: string; subtitle?: string; footer?: ItemsTableFooterRow[] } = {},
): string {
    const header = options.title
        ? `<tr><td colspan="2" class="dv-cell" style="padding:12px 14px;background:${SURFACE};border-bottom:1px solid ${LINE};border-radius:10px 10px 0 0;"><div style="font-size:14px;font-weight:700;line-height:1.4;color:${INK};">${esc(options.title)}</div>${options.subtitle ? `<div style="margin-top:2px;font-size:12.5px;line-height:1.5;color:${MUTED};">${esc(options.subtitle)}</div>` : ""}</td></tr>`
        : "";
    const rows = items
        .map((item, i) => {
            const total = item.lineTotal ?? item.unitPrice * item.quantity;
            const details = (item.details ?? []).filter(Boolean).map(esc).join(" · ");
            const tags = (item.tags ?? [])
                .filter(Boolean)
                .map((tag) => `<span style="display:inline-block;margin:6px 6px 0 0;padding:2px 8px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:11px;font-weight:600;">${esc(tag)}</span>`)
                .join("");
            const struck =
                item.originalUnitPrice && item.originalUnitPrice > item.unitPrice
                    ? ` <span style="color:#a1a1aa;text-decoration:line-through;">${money(item.originalUnitPrice)}</span>`
                    : "";
            const border = i ? `border-top:1px solid ${LINE};` : "";
            return `<tr><td class="dv-cell" style="padding:13px 14px;vertical-align:top;${border}"><div style="font-size:14px;font-weight:600;line-height:1.45;color:${INK};">${esc(item.name)}</div>${details ? `<div style="margin-top:3px;font-size:12.5px;line-height:1.5;color:${MUTED};">${details}</div>` : ""}<div style="margin-top:3px;font-size:12.5px;line-height:1.5;color:${MUTED};">Qty ${esc(item.quantity)} × ${money(item.unitPrice)}${struck}</div>${tags}</td><td align="right" class="dv-cell" style="padding:13px 14px;vertical-align:top;white-space:nowrap;font-size:14px;font-weight:600;color:${INK};${border}">${money(total)}</td></tr>`;
        })
        .join("");
    const footerRows = options.footer ?? [];
    const footer = footerRows
        .map((row, i) => {
            const first = i === 0;
            const lastRow = i === footerRows.length - 1;
            const rule = first ? `border-top:1px solid ${LINE};` : row.total ? `border-top:1px solid #d4d4d8;` : "";
            const pad = `${first || row.total ? "11px" : "3px"} 14px ${lastRow ? "12px" : "3px"}`;
            const color = row.discount ? "#047857" : row.total ? INK : BODY;
            const weight = row.total ? 700 : 400;
            const size = row.total ? "14px" : "13px";
            const amount = row.discount ? `− ${money(Math.abs(row.amount))}` : money(row.amount);
            return `<tr><td class="dv-cell" style="padding:${pad};background:${SURFACE};${rule}font-size:${size};font-weight:${weight};color:${color};${lastRow ? "border-bottom-left-radius:10px;" : ""}">${esc(row.label)}</td><td align="right" class="dv-cell" style="padding:${pad};background:${SURFACE};${rule}font-size:${size};font-weight:${weight};color:${color};white-space:nowrap;${lastRow ? "border-bottom-right-radius:10px;" : ""}">${amount}</td></tr>`;
        })
        .join("");
    return `<table role="presentation" class="dv-full dv-box" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;margin:0 0 16px;border:1px solid ${LINE};border-radius:10px;border-collapse:separate;">${header}${rows}${footer}</table>`;
}

/**
 * A plain grid with a header row — per-seller breakdowns. Cells are escaped;
 * columns listed in `alignRight` hold amounts.
 */
export function simpleTable(headers: string[], rows: string[][], alignRight: number[] = []): string {
    const align = (i: number) => (alignRight.includes(i) ? "right" : "left");
    const head = headers
        .map((h, i) => `<th align="${align(i)}" class="dv-cell" style="padding:10px 14px;background:${SURFACE};border-bottom:1px solid ${LINE};font-size:12px;font-weight:700;color:${MUTED};text-align:${align(i)};">${esc(h)}</th>`)
        .join("");
    const body = rows
        .map(
            (row, r) =>
                `<tr>${row
                    .map((cell, i) => `<td align="${align(i)}" class="dv-cell" style="padding:10px 14px;font-size:13.5px;color:${INK};${r ? `border-top:1px solid ${LINE};` : ""}${alignRight.includes(i) ? "white-space:nowrap;" : ""}">${esc(cell)}</td>`)
                    .join("")}</tr>`,
        )
        .join("");
    return `<table role="presentation" class="dv-full dv-box" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;margin:0 0 16px;border:1px solid ${LINE};border-radius:10px;border-collapse:separate;"><tr>${head}</tr>${body}</table>`;
}

export interface TotalRow {
    label: string;
    amount: number;
    /** A discount is shown as a negative in green; the total is emphasised. */
    kind?: "discount" | "total";
}

export function totalsTable(rows: TotalRow[]): string {
    const cells = rows
        .map((row) => {
            const isTotal = row.kind === "total";
            const color = row.kind === "discount" ? "#047857" : isTotal ? INK : BODY;
            const top = isTotal ? `border-top:2px solid ${INK};` : "";
            const size = isTotal ? "16px" : "14px";
            const weight = isTotal ? "700" : "400";
            const amount = row.kind === "discount" ? `− ${money(Math.abs(row.amount))}` : money(row.amount);
            return `<tr><td width="100%" class="dv-cell" style="padding:${isTotal ? "12px" : "5px"} 12px ${isTotal ? "0" : "5px"} 0;font-size:${size};font-weight:${weight};color:${color};${top}">${esc(row.label)}</td><td align="right" class="dv-cell" style="padding:${isTotal ? "12px" : "5px"} 0 ${isTotal ? "0" : "5px"};font-size:${size};font-weight:${weight};color:${isTotal ? BRAND_DARK : color};white-space:nowrap;${top}">${amount}</td></tr>`;
        })
        .join("");
    return `<table role="presentation" class="dv-full" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;margin:8px 0 20px;">${cells}</table>`;
}

/** A one-time code, large and spaced so it can be read and typed. */
export function codeBox(code: string, caption = "Your code"): string {
    return `<table role="presentation" class="dv-full" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;margin:0 0 20px;border-collapse:separate;"><tr><td align="center" class="dv-tint" style="padding:22px 16px;background:#fff7ed;border:1px dashed #fdba74;border-radius:10px;"><div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_DARK};">${esc(caption)}</div><div style="margin-top:8px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:32px;font-weight:700;letter-spacing:10px;color:${INK};">${esc(code)}</div></td></tr></table>`;
}

export function numberedSteps(steps: string[]): string {
    const rows = steps
        .map(
            (step, i) =>
                `<tr><td width="30" valign="top" style="padding:0 0 12px;"><div style="width:22px;height:22px;border-radius:999px;background:#fff7ed;color:${BRAND_DARK};font-size:12px;font-weight:700;line-height:22px;text-align:center;">${i + 1}</div></td><td valign="top" style="padding:1px 0 12px;font-size:14px;line-height:1.6;color:${BODY};">${esc(step)}</td></tr>`,
        )
        .join("");
    return `<table role="presentation" class="dv-full" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;margin:0 0 12px;">${rows}</table>`;
}

/**
 * Where an order is on its way. Only the forward path is drawn; a delay,
 * cancellation or return is explained in a notice instead.
 */
const PROGRESS = [
    { key: "ORDER_PLACED", label: "Placed" },
    { key: "CONFIRMED", label: "Confirmed" },
    { key: "PROCESSING", label: "Preparing" },
    { key: "ASSIGNED_TO_RIDER", label: "On the way" },
    { key: "DELIVERED", label: "Delivered" },
];
const PROGRESS_ALIASES: Record<string, string> = { ARRIVED_AT_WAREHOUSE: "PROCESSING" };

export function orderProgress(status: string): string {
    const key = PROGRESS_ALIASES[status] ?? status;
    const at = PROGRESS.findIndex((step) => step.key === key);
    if (at < 0) return "";
    const cells = PROGRESS.map((step, i) => {
        const done = i <= at;
        const bar = done ? BRAND : LINE;
        const text = i === at ? INK : done ? BODY : "#a1a1aa";
        return `<td width="20%" valign="top" style="padding:0 2px;"><div style="height:4px;border-radius:999px;background:${bar};font-size:0;line-height:0;">&nbsp;</div><div style="margin-top:8px;font-size:11.5px;line-height:1.3;font-weight:${i === at ? 700 : 500};color:${text};">${esc(step.label)}</div></td>`;
    }).join("");
    return `<table role="presentation" class="dv-full" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;margin:4px 0 24px;table-layout:fixed;"><tr>${cells}</tr></table>`;
}

export interface EmailLayoutOptions {
    /** Hidden preview text shown beside the subject in the inbox list. */
    preheader: string;
    /** Small label above the title — "Order update", "Vendor account". */
    eyebrow?: string;
    title: string;
    /** Trusted markup built from the helpers above. */
    html: string;
    /** The footer's reason for the email; defaults to an automated-message note. */
    footerNote?: string;
    /** Extra trusted footer markup, e.g. an unsubscribe link. */
    footerHtml?: string;
}

export function emailLayout(options: EmailLayoutOptions): string {
    const year = new Date().getFullYear();
    const footerNote = options.footerNote ?? "This is an automated message from DajuVai. Please do not reply to this email.";
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light only">
<title>${esc(options.title)}</title>
<style>
  @media only screen and (max-width:620px) {
    .dv-outer { padding:0 !important; background:#ffffff !important; }
    .dv-container { width:100% !important; }
    .dv-card { border:0 !important; border-radius:0 !important; }
    .dv-full { width:100% !important; min-width:100% !important; max-width:100% !important; }
    .dv-box { border:0 !important; border-radius:8px !important; background-color:#f4f4f5 !important; }
    .dv-tint { border:0 !important; }
    .dv-cell { border-top:0 !important; border-bottom:0 !important; }
    .dv-rule { border:0 !important; }
    .dv-pad { padding-left:16px !important; padding-right:16px !important; }
    .dv-top { padding-top:24px !important; }
    .dv-cell { padding-left:10px !important; padding-right:10px !important; }
    .dv-title { font-size:21px !important; }
    .dv-label { width:40% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${esc(options.preheader)}&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;</div>
<table role="presentation" class="dv-full" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;background:#f4f4f5;">
  <tr>
    <td align="center" class="dv-outer" style="padding:32px 12px;">
      <table role="presentation" class="dv-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;font-family:${FONT};">
        <tr>
          <td class="dv-card" bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-radius:12px;">
            <table role="presentation" class="dv-full" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;min-width:100%;">
              <tr>
                <td class="dv-pad dv-rule" style="padding:24px 32px 20px;border-bottom:1px solid ${LINE};">
                  <a href="${esc(appUrl("/"))}" style="text-decoration:none;"><img src="${esc(config.EMAIL_LOGO_URL)}" width="57" height="72" alt="DajuVai" style="display:block;width:57px;height:72px;border:0;outline:none;text-decoration:none;font-size:20px;font-weight:800;color:${BRAND};" /></a>
                </td>
              </tr>
              <tr>
                <td class="dv-pad dv-top" style="padding:28px 32px 12px;">
                  ${options.eyebrow ? `<div style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_DARK};">${esc(options.eyebrow)}</div>` : ""}
                  <h1 class="dv-title" style="margin:0 0 20px;font-size:24px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${INK};">${esc(options.title)}</h1>
                  ${options.html}
                </td>
              </tr>
              <tr>
                <td class="dv-pad" style="padding:0 32px 28px;">
                  <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:${BODY};">— The DajuVai team</p>
                </td>
              </tr>
              <tr>
                <td class="dv-pad dv-rule" align="center" style="padding:20px 32px 24px;border-top:1px solid ${LINE};font-size:12px;line-height:1.6;color:${MUTED};">
                  ${esc(footerNote)}${options.footerHtml ? `<br>${options.footerHtml}` : ""}<br>
                  <a href="${esc(appUrl("/contact"))}" style="color:${MUTED};text-decoration:underline;">Contact support</a> · © ${year} DajuVai
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
