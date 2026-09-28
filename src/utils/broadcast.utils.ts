import { createHmac, timingSafeEqual } from "crypto";
import { button, emailLayout, paragraph } from "./emailLayout.utils";
import {
    BroadcastActionType,
    BroadcastStatus,
} from "../entities/broadcast.entity";

// Pure helpers for broadcasts: nothing here touches the database or network.

export type BroadcastOwnerType = "user" | "vendor";

export interface BroadcastMessage {
    title: string;
    subject?: string | null;
    body: string;
    imageUrl?: string | null;
    actionType?: string | null;
    actionValue?: string | null;
}

export const escapeHtml = (value: unknown): string =>
    String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

/** Why an action cannot be used, or null when it can. */
export function actionProblem(
    actionType: string | null | undefined,
    actionValue: string | null | undefined,
): string | null {
    const type = actionType || BroadcastActionType.NONE;
    const value = (actionValue ?? "").trim();
    switch (type) {
        case BroadcastActionType.NONE:
        case BroadcastActionType.OPEN_DEALS:
            return null;
        case BroadcastActionType.OPEN_PRODUCT:
        case BroadcastActionType.OPEN_STORE:
        case BroadcastActionType.OPEN_CATEGORY:
        case BroadcastActionType.OPEN_SUBCATEGORY:
            return value ? null : "Choose what the message opens";
        case BroadcastActionType.OPEN_URL:
            try {
                const url = new URL(value);
                return url.protocol === "https:" || url.protocol === "http:"
                    ? null
                    : "Links must start with http:// or https://";
            } catch {
                return "Enter a full link, starting with https://";
            }
        default:
            return "This action is not available for broadcasts";
    }
}

/**
 * Where the action leads on the storefront, as an absolute URL. The paths are
 * the Next storefront's; it redirects the React app's old ones to them.
 */
export function actionUrl(
    appUrl: string,
    actionType: string | null | undefined,
    actionValue: string | null | undefined,
): string | null {
    const base = appUrl.replace(/\/$/, "");
    const value = encodeURIComponent((actionValue ?? "").trim());
    switch (actionType) {
        case BroadcastActionType.OPEN_PRODUCT:
            return value ? `${base}/product/${value}` : null;
        case BroadcastActionType.OPEN_STORE:
            return value ? `${base}/store/${value}` : null;
        case BroadcastActionType.OPEN_CATEGORY:
            return value ? `${base}/category/${value}` : null;
        case BroadcastActionType.OPEN_SUBCATEGORY:
            // No page of its own: the shop, filtered to it.
            return value ? `${base}/shop?subcategoryIds=${value}` : null;
        case BroadcastActionType.OPEN_DEALS:
            return `${base}/shop?hasDeal=true`;
        case BroadcastActionType.OPEN_URL:
            return actionProblem(actionType, actionValue) ? null : (actionValue ?? "").trim();
        default:
            return null;
    }
}

/**
 * Campaign email. Plain text only: the body is escaped and its line breaks
 * kept, so nothing an admin types can inject markup into a customer's inbox.
 */
const ACTION_BUTTON: Partial<Record<string, string>> = {
    [BroadcastActionType.OPEN_PRODUCT]: "View product",
    [BroadcastActionType.OPEN_STORE]: "Visit the store",
    [BroadcastActionType.OPEN_CATEGORY]: "Browse the category",
    [BroadcastActionType.OPEN_SUBCATEGORY]: "Browse now",
    [BroadcastActionType.OPEN_DEALS]: "See the deals",
    [BroadcastActionType.OPEN_URL]: "Open link",
};

export function renderBroadcastEmail(
    message: BroadcastMessage,
    links: { appUrl: string; unsubscribeUrl?: string | null },
): string {
    const href = actionUrl(links.appUrl, message.actionType, message.actionValue);
    const image = message.imageUrl
        ? `<img src="${escapeHtml(message.imageUrl)}" alt="" width="526" style="display:block;width:100%;max-width:526px;height:auto;margin:0 0 20px;border-radius:10px;border:0;" />`
        : "";
    return emailLayout({
        preheader: message.body.slice(0, 140),
        title: message.title || message.subject || "DajuVai",
        html:
            image +
            paragraph(message.body) +
            (href ? button(ACTION_BUTTON[message.actionType ?? ""] ?? "Open in DajuVai", href) : ""),
        footerNote: "You're receiving this because you have a DajuVai account.",
        footerHtml: links.unsubscribeUrl
            ? `<a href="${escapeHtml(links.unsubscribeUrl)}" style="color:#71717a;text-decoration:underline;">Unsubscribe from these emails</a>`
            : undefined,
    });
}

/**
 * The outcome of a broadcast whose deliveries have all settled. Skips — no
 * device, no email, unsubscribed — are expected and do not make a send
 * partial; failures do. Reaching nobody at all is a failure.
 */
export function settledStatus(counts: { sent: number; failed: number }): BroadcastStatus {
    if (counts.sent === 0) return BroadcastStatus.FAILED;
    return counts.failed > 0 ? BroadcastStatus.PARTIALLY_COMPLETED : BroadcastStatus.COMPLETED;
}

/** SMTP replies that will not change on retry: the address itself is bad. */
export const isPermanentEmailError = (message: string): boolean =>
    /\b(550|551|553|554)\b|mailbox (not found|unavailable)|user unknown|no such user|malformed|invalid (recipient|address)|relay access denied/i.test(
        message,
    );


// ── Unsubscribe tokens ──────────────────────────────────────────────────────
// `<type>.<id>.<hmac>`: no expiry, because an unsubscribe link in a months-old
// email must still work. The purpose prefix keeps the MAC from being reusable
// as any other kind of token signed with the same secret.

const mac = (secret: string, payload: string) =>
    createHmac("sha256", secret).update(`broadcast-unsubscribe:${payload}`).digest("base64url");

export function signUnsubscribeToken(secret: string, type: BroadcastOwnerType, id: number): string {
    const payload = `${type}.${id}`;
    return `${payload}.${mac(secret, payload)}`;
}

export function verifyUnsubscribeToken(
    secret: string,
    token: string,
): { type: BroadcastOwnerType; id: number } | null {
    const match = /^(user|vendor)\.(\d{1,10})\.([A-Za-z0-9_-]{43})$/.exec(token.trim());
    if (!match || !secret) return null;
    const [, type, id, signature] = match;
    const expected = Buffer.from(mac(secret, `${type}.${id}`));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    return { type: type as BroadcastOwnerType, id: Number(id) };
}
