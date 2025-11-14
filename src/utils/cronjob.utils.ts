import cron from "node-cron";
import { User } from "../entities/user.entity";
import { In, LessThan, Not } from "typeorm";
import AppDataSource from "../config/db.config";
import { OrderStatus, Order, PaymentStatus, PaymentMethod } from '../entities/order.entity';
import { sendOrderStatusEmail } from "./nodemailer.utils";
import { OrderItem } from "../entities/orderItems.entity";
import { NotificationService } from "../service/notification.service";

const userDB = AppDataSource.getRepository(User);
const orderDB = AppDataSource.getRepository(Order);
const orderItemRepo = AppDataSource.getRepository(OrderItem);


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
    cron.schedule("*/2 * * * *", async () => { // every 2 minutes
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
                    "resendBlockUntil"
                ],
                where: {
                    verificationCodeExpire: LessThan(new Date()),
                    verificationCode: Not(null)
                }
            });

            if (expiredUsers.length > 0) {
                for (const user of expiredUsers) {
                    try {
                        user.verificationCode = null;
                        user.verificationCodeExpire = null;
                        user.resendBlockUntil = null;
                        user.resendCount = null;

                        await userDB.save(user);
                        console.log(`Token cleared for user ${user.id} ✅`);
                    } catch (err) {
                        console.error(`Failed to update user ${user.id}:`, err);
                    }
                }
            }
            console.log("Cron job completed for token cleanup");
        } catch (err) {
            console.error("❌ Error in cron job:", err);
        }
    });
};
/**
 * Periodic cleanup of stale pending orders.
 * Runs every 2 hours on the hour (e.g., 12:00, 14:00, 16:00).
 * 
 * Logic:
 * - Calculate threshold date as current time minus 24 hours.
 * - Find orders with status 'PENDING' created before threshold date.
 * - For each such order:
 *    - Remove order entity from DB, deleting it permanently.
 * 
 * Purpose:
* - Remove old pending orders that may be abandoned or not processed.
 * - Keep order data clean and avoid clutter.
 */
export const orderCleanUp = () => {
    cron.schedule("0 */2 * * *", async () => { // runs every 2 hours at minute 0
        try {
            const thresholdDate = new Date();
            thresholdDate.setHours(thresholdDate.getHours() - 24); // 24 hours ago

            // Find all PENDING orders created more than 24 hours ago
            const pendingOrders = await orderDB.find({
                where: {
                    status: OrderStatus.CONFIRMED,
                    paymentStatus: PaymentStatus.UNPAID,
                    createdAt: LessThan(thresholdDate),
                },
                relations: ['orderItems'], // Include related order items if needed for cascade
            });

            if (pendingOrders.length > 0) {
                for (const order of pendingOrders) {
                    // Delete order from DB
                    await orderDB.remove(order);
                    console.log(`Order ${order.id} deleted 🗑️✅`);
                }
                console.log(`Deleted ${pendingOrders.length} pending orders`);
            } else {
                console.log("No pending orders to delete");
            }
        } catch (err) {
            // Log any error that occurs during the order cleanup cron job
            console.error("❌ Error in order cleanup cron job:", err);
        }
    });
};

// set order status to cancelled if the payment is dealyed formore than 15 minutes incase of esewa and nps 
export const startOrderCleanupJob = () => {
    cron.schedule("*/5 * * * *", async () => {
        console.log("⏰ [CRON] Checking for unpaid online orders...");

        try {
            const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
            console.log(
                `🕒 [CRON] Cancelling orders created before: ${fifteenMinutesAgo.toISOString()}`
            );

            const staleOrders = await orderDB.find({
                where: {
                    paymentMethod: In([PaymentMethod.ESEWA, PaymentMethod.NPX]),
                    paymentStatus: PaymentStatus.UNPAID,
                    createdAt: LessThan(fifteenMinutesAgo),
                    status: OrderStatus.PENDING,
                },
                relations: ["orderedBy", "orderItems", "orderItems.vendor"],
            });

            console.log("------Stale orders-----------")
            console.log(staleOrders)

            if (!staleOrders.length) {
                console.log("✅ [CRON] No stale unpaid orders found.");
                return;
            }

            console.log(`⚠️ [CRON] Found ${staleOrders.length} unpaid orders to cancel.`);

            for (const order of staleOrders) {
                console.log(`🚨 [ORDER] Processing Order ID: ${order.id} ...`);

                order.status = OrderStatus.CANCELLED;
                await orderDB.save(order);
                console.log(`🛑 [ORDER] Order #${order.id} status set to CANCELLED.`);

                const userEmail = order.orderedBy?.email;
                const userName = order.orderedBy?.username || "Customer";

                // Fetch vendors
                const orderItems = await orderItemRepo.find({
                    where: { order: { id: order.id } },
                    relations: ["vendor"],
                });

                const vendorEmails = orderItems
                    .map((item) => item.vendor?.email)
                    .filter(Boolean);

                // Send email to user
                if (userEmail) {
                    console.log(`📧 [EMAIL] Sending cancellation email to user: ${userEmail}`);
                    await sendOrderStatusEmail(
                        userEmail,
                        order.id,
                        "Cancelled",
                        `Order #${order.id} Cancelled - Payment Timeout`
                    );
                    console.log(`✅ [EMAIL] Sent to user: ${userEmail}`);
                } else {
                    console.log(`⚠️ [EMAIL] No user email found for Order #${order.id}`);
                }

                // Send emails to vendors
                if (vendorEmails.length) {
                    console.log(
                        `📧 [EMAIL] Sending vendor notification to ${vendorEmails.length} vendor(s).`
                    );
                    for (const vendorEmail of vendorEmails) {
                        await sendOrderStatusEmail(
                            vendorEmail,
                            order.id,
                            "Cancelled",
                            `Order #${order.id} Cancelled by System`
                        );
                        console.log(`✅ [EMAIL] Sent to vendor: ${vendorEmail}`);
                    }
                } else {
                    console.log(`⚠️ [EMAIL] No vendor email(s) found for Order #${order.id}`);
                }

                // Send notification (in-app or push)
                console.log(`🔔 [NOTIFY] Sending cancellation notification for Order #${order.id}`);
                const notificationService = new NotificationService();
                await notificationService.notifyOrderStatusUpdated(order);
                console.log(`✅ [NOTIFY] Notification sent for Order #${order.id}`);

                console.log(`🚫 [CRON] Finished cancelling Order #${order.id}`);
            }

            console.log("🎯 [CRON] Cleanup cycle completed successfully.\n");
        } catch (error) {
            console.error("❌ [CRON ERROR] Failed during order cleanup:", error);
        }
    });
};