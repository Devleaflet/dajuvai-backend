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
 * How long a pending online-payment checkout holds its stock before the cron
 * sweep expires it and puts the stock back. Long enough for a gateway
 * payment; short enough that an abandoned one doesn't keep the last unit
 * from other shoppers for long. A payment confirmed after expiry still
 * becomes its order when the stock is still there (materializeDraftOrder).
 */
export const CHECKOUT_DRAFT_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * A checkout that has been validated & priced but NOT yet turned into an
 * order. Online-payment checkouts (NPX / eSewa / ONLINE_PAYMENT) only
 * materialize into a real Order after the gateway confirms success; COD
 * checkouts never use drafts. The draft holds its stock while the shopper
 * pays; a failed, cancelled or abandoned payment puts it back. No order row
 * and no promo claim exist until the payment is confirmed.
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

    /**
     * True while this draft's items are off the shelf. Set when the draft is
     * created, cleared when it becomes an order or ends without one — the
     * second puts the stock back. Drafts from before holds existed are false.
     */
    @Column({ type: "boolean", default: false })
    stockHeld: boolean;

    /**
     * True while this draft holds one use of its promo code. Taken with the
     * stock, so a limit-1 code cannot be paid for twice; given back when the
     * draft ends without an order, turned into a redemption when it becomes one.
     */
    @Column({ type: "boolean", default: false })
    promoHeld: boolean;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
