import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    PrimaryGeneratedColumn,
    UpdateDateColumn,
} from "typeorm";
import { PaymentMethod } from "./order.entity";

export enum CheckoutDraftStatus {
    PENDING = "PENDING",
    COMPLETED = "COMPLETED",
    CANCELLED = "CANCELLED",
    EXPIRED = "EXPIRED",
}

/**
 * How long a pending online-payment checkout stays alive before the cron
 * sweep marks it expired. Generous enough to cover slow gateway flows,
 * short enough to not accumulate abandoned sessions.
 */
export const CHECKOUT_DRAFT_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

/**
 * A checkout that has been validated & priced but NOT yet turned into an
 * order. Online-payment checkouts (NPX / eSewa / ONLINE_PAYMENT) only
 * materialize into a real Order after the gateway confirms success; COD
 * checkouts never use drafts. Abandoned or failed payments simply expire
 * here — no order row, no stock reservation, no promo claim.
 */
@Entity("checkout_drafts")
@Index(["userId", "status"])
@Index(["expiresAt"])
export class CheckoutDraft {
    @PrimaryGeneratedColumn()
    id: number;

    @Index()
    @Column()
    userId: number;

    @Column({
        type: "enum",
        enum: CheckoutDraftStatus,
        enumName: "checkout_drafts_status_enum",
        default: CheckoutDraftStatus.PENDING,
    })
    status: CheckoutDraftStatus;

    @Column({
        type: "enum",
        enum: PaymentMethod,
        enumName: "checkout_drafts_paymentmethod_enum",
    })
    paymentMethod: PaymentMethod;

    /** Pre-generated order number, reused when the order materializes. */
    @Column()
    orderNumber: string;

    /**
     * Checkout payload snapshot: fullName, phoneNumber, shippingAddress,
     * isBuyNow, productId, variantId, quantity, promoCode,
     * ageRestrictedAcknowledged, idempotencyKey, instrumentName.
     */
    @Column({ type: "jsonb" })
    payload: Record<string, any>;

    /** Item snapshot: [{ productId, variantId, quantity, price }]. */
    @Column({ type: "jsonb" })
    items: Array<{
        productId: number;
        variantId: number | null;
        quantity: number;
        price: number;
    }>;

    /**
     * Priced totals snapshot: totalPrice, shippingFee, merchandiseSubtotal,
     * discountTotal, taxTotal, serviceCharge, vendorShippingRows[].
     */
    @Column({ type: "jsonb" })
    totals: Record<string, any>;

    @Column({ nullable: true })
    addressId?: number;

    /** NPS (Nepal Payment System) merchant transaction id. */
    @Index()
    @Column({ nullable: true })
    mTransactionId?: string | null;

    /** eSewa transaction uuid generated at payment initiation. */
    @Column({ nullable: true })
    esewaTransactionUuid?: string | null;

    /** Set once the draft has materialized into an order. */
    @Column({ nullable: true })
    orderId?: number | null;

    @Column({ type: "timestamp" })
    expiresAt: Date;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
