import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
} from "typeorm";

/** Which gateway sent the event. Kept open: a new provider is a new value. */
export enum WebhookProvider {
    NPX = "NPX",
    ESEWA = "ESEWA",
}

/**
 * One row per gateway event we have already acted on.
 *
 * Payment gateways retry. A notification that times out on our side, a network
 * blip, or a provider's own at-least-once delivery all produce a second copy of
 * an event we have handled — and handling it twice means a second "payment
 * received" email, a second stock restoration, or a second promo release.
 *
 * The guard is the unique index on `(provider, eventId)`, not a read. Checking
 * "have we seen this?" and then acting is a race two concurrent deliveries both
 * win; inserting first and letting the database refuse the duplicate is decided
 * once, by Postgres. See `claimWebhookEvent`.
 *
 * Rows are kept, not deleted on success: they are the audit trail of what the
 * gateway told us and when. A cron trims them past the retention window.
 */
@Entity("processed_webhooks")
@Index(["provider", "eventId"], { unique: true })
@Index(["processedAt"])
export class ProcessedWebhook {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: "varchar", length: 32 })
    provider: string;

    /**
     * The gateway's own identifier for this event, made unique per outcome.
     *
     * NPS sends no event id of its own, so it is composed from the merchant
     * transaction and the status it reports — see `webhookEventId`. A genuine
     * state change (pending, then success) is therefore a different event and
     * is processed; an exact duplicate is not.
     */
    @Column({ type: "varchar", length: 191 })
    eventId: string;

    /** The order the event resolved to, once known. Null for an unmatched event. */
    @Column({ type: "int", nullable: true })
    orderId: number | null;

    /** What the gateway sent, for reconciliation and disputes. */
    @Column({ type: "jsonb", nullable: true })
    payload: Record<string, unknown> | null;

    @CreateDateColumn({ type: "timestamp" })
    processedAt: Date;
}
