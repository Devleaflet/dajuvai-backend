import cron from "node-cron";
import { User } from "../entities/user.entity";
import { LessThan, Not } from "typeorm";
import AppDataSource from "../config/db.config";
import { OrderStatus, Order } from '../entities/order.entity';

const userDB = AppDataSource.getRepository(User);
const orderDB = AppDataSource.getRepository(Order);

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
    cron.schedule("*/2 * * * *", async () => { // runs every 2 minutes
        try {
            // Find all users whose verification token has expired and still present
            const expiredUsers = await userDB.find({
                where: {
                    verificationCodeExpire: LessThan(new Date()), // expired date check
                    verificationCode: Not(null)                    // token exists
                }
            });

            console.log(expiredUsers);
            

            if (expiredUsers.length > 0) {
                for (const user of expiredUsers) {
                    // Clear verification related fields
                    user.verificationCode = null;
                    user.verificationCodeExpire = null;
                    user.resendBlockUntil = null;
                    user.resendCount = null;

                    // Persist changes to DB
                    await userDB.save(user);
                    console.log(" Token 🗑️✅");
                }
            }
            console.log("Cron job completed for token cleanup");
        } catch (err) {
            // Log any unexpected errors to troubleshoot cron failures
            console.error("❌ Error in cron job:", err);
        }
    });
}

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
                    status: OrderStatus.PENDING,
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
