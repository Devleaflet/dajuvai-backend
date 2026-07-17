import admin from "../config/firebase.config";
import logger from "./logger";

// FCM rejects more than 500 messages in a single sendEach call.
const BATCH_SIZE = 500;

// FCM says the token is dead — stop sending to it.
const INVALID_TOKEN_CODES = new Set([
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
    "messaging/invalid-argument",
]);

export interface PushPayload {
    title: string;
    body: string;
    data?: Record<string, string>;
    imageUrl?: string;
    priority?: "high" | "normal";
}

export interface PushResult {
    successCount: number;
    failureCount: number;
    /** Tokens FCM reported as dead. Caller should deactivate these. */
    invalidTokens: string[];
    messageIds: string[];
}

/** Never log a full token — the prefix is enough to correlate. */
export const maskToken = (token: string) => `${token.slice(0, 12)}…`;

/**
 * Builds the FCM message body shared by every send path.
 * `data` values must all be strings — FCM rejects the message otherwise.
 */
function buildMessage(payload: PushPayload): Omit<admin.messaging.Message, "token" | "topic"> {
    const { title, body, imageUrl } = payload;
    const priority = payload.priority ?? "high";

    const data: Record<string, string> = {};
    for (const [key, value] of Object.entries(payload.data ?? {})) {
        if (value === undefined || value === null) continue;
        data[key] = String(value);
    }
    // Mirror the image into data so the client can render it for data-only
    // (background) messages, where the notification block is not delivered.
    if (imageUrl) data.imageUrl = imageUrl;

    return {
        notification: { title, body, ...(imageUrl ? { imageUrl } : {}) },
        data,
        android: {
            priority,
            ttl: 86_400_000, // 24h in ms — Admin SDK converts to the v1 API's "86400s"
            notification: {
                title,
                body,
                sound: "default",
                channelId: "high_importance_channel",
                clickAction: "FLUTTER_NOTIFICATION_CLICK",
                ...(imageUrl ? { imageUrl } : {}),
            },
        },
        apns: {
            headers: {
                "apns-priority": priority === "high" ? "10" : "5",
                "apns-expiration": String(Math.floor(Date.now() / 1000) + 86_400),
            },
            payload: {
                aps: {
                    alert: { title, body },
                    sound: "default",
                    badge: 1,
                    "mutable-content": 1,
                },
            },
            ...(imageUrl ? { fcmOptions: { imageUrl } } : {}),
        },
    };
}

/**
 * Sends to many tokens, in batches of 500, collecting dead tokens as it goes.
 * Never throws — a push failure must not break the business flow that triggered it.
 */
export async function sendToTokens(tokens: string[], payload: PushPayload): Promise<PushResult> {
    const result: PushResult = {
        successCount: 0,
        failureCount: 0,
        invalidTokens: [],
        messageIds: [],
    };
    if (!tokens.length) return result;

    const message = buildMessage(payload);

    for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
        const batch = tokens.slice(i, i + BATCH_SIZE);
        try {
            const response = await admin
                .messaging()
                .sendEach(batch.map((token) => ({ token, ...message })));

            response.responses.forEach((res, index) => {
                if (res.success) {
                    result.successCount++;
                    if (res.messageId) result.messageIds.push(res.messageId);
                    return;
                }
                result.failureCount++;
                const code = res.error?.code ?? "unknown";
                if (INVALID_TOKEN_CODES.has(code)) {
                    result.invalidTokens.push(batch[index]);
                }
                logger.warn("[FCM] send failed for token", {
                    token: maskToken(batch[index]),
                    code,
                });
            });
        } catch (error) {
            // Whole batch blew up (network, auth). Count as failures but do not
            // deactivate — these tokens are not proven dead.
            result.failureCount += batch.length;
            logger.error("[FCM] batch send error", {
                batchSize: batch.length,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    return result;
}

/** Sends to a Firebase topic. FCM fans out to subscribers; no per-device counts come back. */
export async function sendToTopic(topic: string, payload: PushPayload): Promise<string> {
    return admin.messaging().send({ topic, ...buildMessage(payload) });
}

// ── Back-compat wrappers ─────────────────────────────────────────────────────
// Existing callers in notification.service.ts use these, so the batching/cleanup
// upgrade did not have to touch every call site.

export async function sendPushNotification(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>,
): Promise<PushResult> {
    return sendToTokens([token], { title, body, data });
}

export async function sendPushToMultiple(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>,
): Promise<PushResult> {
    return sendToTokens(tokens, { title, body, data });
}
