import AppDataSource from "../config/db.config";
import { ProcessedWebhook } from "../entities/processedWebhook.entity";

/**
 * Webhook de-duplication, decided by the database.
 *
 * Gateways deliver at least once. The same notification arrives again when our
 * response was slow, when the provider retries on its own schedule, or when an
 * operator replays one by hand — and acting twice means a second confirmation
 * email, a second stock restoration, or a second promo release.
 *
 * The claim is an INSERT, not a SELECT. "Have we handled this?" followed by
 * "then handle it" is a race that two simultaneous deliveries both pass;
 * `ON CONFLICT DO NOTHING` lets exactly one of them insert, and whoever
 * inserted owns the side effects. That is the same reasoning the cancellation
 * path already uses with its conditional UPDATE — this generalises it to every
 * outcome, including success.
 */

/**
 * A stable id for one gateway outcome.
 *
 * NPS sends no event id, so it is composed: the merchant transaction plus the
 * status it is reporting. A transaction that legitimately moves on (pending,
 * then success) yields a different id and is processed; an exact repeat does
 * not. The gateway's own reference is appended when present, which distinguishes
 * two genuine attempts against one merchant transaction.
 */
export function webhookEventId(parts: {
    merchantTxnId: string;
    status?: string | null;
    gatewayTxnId?: string | null;
}): string {
    return [
        parts.merchantTxnId,
        (parts.status ?? "").toUpperCase() || "UNKNOWN",
        parts.gatewayTxnId ?? "",
    ]
        .join(":")
        .slice(0, 191);
}

/**
 * Records this event as handled, and says whether it is ours to handle.
 *
 * Returns `true` for the first delivery and `false` for every repeat. A caller
 * that gets `false` must answer the gateway with success and do nothing else:
 * the work was already done, and a non-2xx reply would only make the gateway
 * retry a third time.
 */
export async function claimWebhookEvent(input: {
    provider: string;
    eventId: string;
    orderId?: number | null;
    payload?: Record<string, unknown> | null;
}): Promise<boolean> {
    const result = await AppDataSource.getRepository(ProcessedWebhook)
        .createQueryBuilder()
        .insert()
        .into(ProcessedWebhook)
        .values({
            provider: input.provider,
            eventId: input.eventId,
            orderId: input.orderId ?? null,
            payload: input.payload ?? null,
        })
        .orIgnore() // ON CONFLICT DO NOTHING against the unique (provider, eventId)
        .execute();

    // `identifiers` is empty when the insert was ignored, which is exactly the
    // duplicate case. `raw.length` agrees; both are checked because TypeORM
    // reports them differently across drivers.
    const inserted =
        (result.identifiers?.filter(Boolean).length ?? 0) > 0 ||
        (Array.isArray(result.raw) && result.raw.length > 0);

    return inserted;
}

/**
 * Attaches the order to an event once it is known.
 *
 * The claim happens before the order is resolved — that ordering is what makes
 * the guard safe — so the link is filled in afterwards. Failing to write it is
 * not worth failing the webhook over: it is reconciliation detail, not the
 * payment.
 */
export async function linkWebhookEventToOrder(
    provider: string,
    eventId: string,
    orderId: number,
): Promise<void> {
    await AppDataSource.getRepository(ProcessedWebhook)
        .update({ provider, eventId }, { orderId })
        .catch(() => undefined);
}
