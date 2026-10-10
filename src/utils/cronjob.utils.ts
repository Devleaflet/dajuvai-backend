import cron from "node-cron";
import { User } from "../entities/user.entity";
import { In, LessThan, Not } from "typeorm";
import AppDataSource from "../config/db.config";
import {
    OrderStatus,
    Order,
    PaymentStatus,
    PaymentMethod,
    DeliveryStatus,
} from "../entities/order.entity";
import { Vendor } from "../entities/vendor.entity";
import { deviceTokenService } from "../service/deviceToken.service";
import { VendorService } from "../service/vendor.service";
import { UserDeletionService } from "../service/user-deletion.service";
import { OrderService } from "../service/order.service";

const userDB = AppDataSource.getRepository(User);
const orderDB = AppDataSource.getRepository(Order);

const vendorRepo = AppDataSource.getRepository(Vendor);

/**
 * Periodic cleanup of expired user verification tokens.
 * Runs every 2 minutes.
 *
 * Logic:
 * - Find users with verificationCodeExpire date in the past AND
 *   who currently have a verificationCode set (not null).
 * - For each such user:
 *    - Reset verificationCode, verificationCodeExpire,
 *      resendBlockUntil, resendCount fields to null.
 *    - Save user entity back to DB to persist these changes.
 *
 * Purpose:
 * - Prevent stale verification codes from lingering indefinitely.
 * - Reset resend limits and blocks so user can try verification again later.
 */
export const tokenCleanUp = () => {
    cron.schedule("*/2 * * * *", async () => {
        // every 2 minutes
        try {
            // Only select known columns to avoid missing column issues
            const expiredUsers = await userDB.find({
                select: [
                    "id",
                    "fullName",
                    "username",
                    "email",
                    "role",
                    "googleId",
                    "facebookId",
                    "provider",
                    "isVerified",
                    "verificationCode",
                    "verificationCodeExpire",
                    "resendCount",
                    "resendBlockUntil",
                ],
                where: {
                    verificationCodeExpire: LessThan(new Date()),
                    verificationCode: Not(null),
                },
            });

            if (expiredUsers.length > 0) {
                for (const user of expiredUsers) {
                    try {
                        user.verificationCode = null;
                        user.verificationCodeExpire = null;
                        user.resendBlockUntil = null;
                        user.resendCount = null;

                        await userDB.save(user);
                    } catch (err) {
                        // silent fail for cron
                    }
                }
            }
        } catch (err) {
            // silent fail for cron
        }
    });
};
/** Payment methods settled online; COD stays UNPAID until delivery by design. */
const ONLINE_PAYMENT_METHODS = [
    PaymentMethod.ESEWA,
    PaymentMethod.NPX,
    PaymentMethod.KHALIT,
    PaymentMethod.ONLINE_PAYMENT,
];

/**
 * Cancels one abandoned online-payment order through changeOrderStatus, so it
 * gets the same restock, promo release, history, audit, customer/vendor
 * emails (with the reason), feed, push and socket as an admin cancellation.
 * `expectedCurrentStatus` makes it a no-op if a payment webhook moved the
 * order in the meantime.
 */
const cancelUnpaidOrder = async (order: Order, reason: string): Promise<void> => {
    try {
        await new OrderService().changeOrderStatus(order.id, OrderStatus.CANCELLED, {
            actorRole: "SYSTEM",
            reason,
            expectedCurrentStatus: order.status,
        });
        await orderDB.update(order.id, { deliveryStatus: DeliveryStatus.DELIVERY_FAILED });
    } catch (error) {
        console.error(`[CRON] Could not cancel unpaid order ${order.id}:`, error);
    }
};

/**
 * Every 2 hours: online-payment orders confirmed but still unpaid after 24
 * hours are cancelled. COD orders are excluded — they are unpaid until the
 * rider collects, and this job used to cancel any that sat in CONFIRMED for a
 * day.
 */
export const orderCleanUp = () => {
    cron.schedule("0 */2 * * *", async () => {
        try {
            const staleOrders = await orderDB.find({
                where: {
                    status: OrderStatus.CONFIRMED,
                    paymentStatus: PaymentStatus.UNPAID,
                    paymentMethod: In(ONLINE_PAYMENT_METHODS),
                    createdAt: LessThan(new Date(Date.now() - 24 * 60 * 60 * 1000)),
                },
                select: { id: true, status: true },
            });

            for (const order of staleOrders) {
                await cancelUnpaidOrder(
                    order,
                    "Confirmed but still unpaid after 24 hours, so the order was cancelled and its stock returned.",
                );
            }
        } catch (err) {
            console.error("[CRON] orderCleanUp failed:", err);
        }
    });
};

// Every 5 minutes: eSewa/NPX orders still unpaid 15 minutes after placement are cancelled.
export const startOrderCleanupJob = () => {
    cron.schedule("*/5 * * * *", async () => {
        try {
            const staleOrders = await orderDB.find({
                where: {
                    paymentMethod: In([PaymentMethod.ESEWA, PaymentMethod.NPX]),
                    paymentStatus: PaymentStatus.UNPAID,
                    createdAt: LessThan(new Date(Date.now() - 15 * 60 * 1000)),
                    status: OrderStatus.ORDER_PLACED,
                },
                select: { id: true, status: true },
            });

            for (const order of staleOrders) {
                await cancelUnpaidOrder(
                    order,
                    "Online payment was not completed within 15 minutes, so the order was cancelled and its stock returned.",
                );
            }
        } catch (error) {
            console.error("[CRON] startOrderCleanupJob failed:", error);
        }
    });
};

// un verified vendor  clean up
export const removeUnverifiedVendors = () => {
    cron.schedule("0 0,12 * * *", async () => {
        try {
            const twentyFourHoursAgo = new Date(
                Date.now() - 24 * 60 * 60 * 1000,
            );
            await vendorRepo.delete({
                isVerified: false,
                createdAt: LessThan(twentyFourHoursAgo),
            });
        } catch (error) {
            // silent fail for cron
        }
    });
};

export const finalizeVendorAccountDeletions = () => {
    cron.schedule("0 * * * *", async () => {
        try {
            await new VendorService().finalizeExpiredVendorDeletions();
        } catch (error) {
            // silent fail for cron; next hourly run retries safely
        }
    });
};

// Finalizes customer accounts whose 30-day deletion grace period elapsed.
// Mirrors finalizeVendorAccountDeletions; safe to retry every hour.
export const finalizeUserAccountDeletions = () => {
    cron.schedule("0 * * * *", async () => {
        try {
            await new UserDeletionService().finalizeExpiredUserDeletions();
        } catch (error) {
            // silent fail for cron; next hourly run retries safely
        }
    });
};

// Expires online-payment checkout drafts whose TTL elapsed without a gateway
// verdict. Drafts never reserve stock or claim promos, so expiring them is a
// pure status flip — safe to retry every 10 minutes.
export const expireStaleCheckoutDraftsJob = () => {
    cron.schedule("*/10 * * * *", async () => {
        try {
            await new OrderService().expireStaleCheckoutDrafts();
        } catch (error) {
            // silent fail for cron; next run retries safely
        }
    });
};

export const staleDeviceTokenCleanUp = () => {
    cron.schedule("0 2 * * *", async () => {
        try {
            await deviceTokenService.cleanupStaleTokens();
        } catch (error) {
            // silent fail for cron
        }
    });
};
