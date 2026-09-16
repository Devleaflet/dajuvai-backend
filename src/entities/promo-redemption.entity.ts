import {
    Column,
    CreateDateColumn,
    Entity,
    Index,
    JoinColumn,
    ManyToOne,
    PrimaryGeneratedColumn,
    Unique,
} from "typeorm";

import { Order } from "./order.entity";
import { Promo } from "./promo.entity";
import { User } from "./user.entity";

/**
 * One customer's use of one promo code, on one order.
 *
 * A ledger rather than a counter column on the promo. `Promo.usageCount` caps
 * how many times a code may be used at all; capping how many times *one
 * customer* may use it needs to know who used it, and a count per user cannot
 * be released accurately when an order is cancelled — decrementing trusts that
 * every increment had a matching customer, which nothing enforces.
 *
 * Rows here are the record: the per-user count is how many exist, releasing is
 * deleting the one for the cancelled order, and support can answer "who used
 * this code" without a second system.
 *
 * Unique on `orderId` so an order can never claim a promo twice, whatever the
 * checkout path retries.
 */
@Entity()
@Unique("UQ_promo_redemption_order", ["orderId"])
@Index("IDX_promo_redemption_promo_user", ["promoId", "userId"])
export class PromoRedemption {
    @PrimaryGeneratedColumn()
    id: number;

    @Column({ type: "int" })
    promoId: number;

    @ManyToOne(() => Promo, { onDelete: "CASCADE" })
    @JoinColumn({ name: "promoId" })
    promo: Promo;

    @Column({ type: "int" })
    userId: number;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    @JoinColumn({ name: "userId" })
    user: User;

    @Column({ type: "int" })
    orderId: number;

    @ManyToOne(() => Order, { onDelete: "CASCADE" })
    @JoinColumn({ name: "orderId" })
    order: Order;

    @CreateDateColumn()
    createdAt: Date;
}
