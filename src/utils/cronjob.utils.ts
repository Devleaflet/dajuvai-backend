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
import { sendOrderStatusEmail } from "./nodemailer.utils";
import { OrderItem } from "../entities/orderItems.entity";
import { NotificationService } from "../service/notification.service";
import { Vendor } from "../entities/vendor.entity";
import { deviceTokenService } from "../service/deviceToken.service";
import { Product } from "../entities/product.entity";
import { Variant } from "../entities/variant.entity";

const userDB = AppDataSource.getRepository(User);
const orderDB = AppDataSource.getRepository(Order);
const orderItemRepo = AppDataSource.getRepository(OrderItem);
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
    cron.schedule("0 */2 * * *", async () => {
        try {
            const thresholdDate = new Date();
            thresholdDate.setHours(thresholdDate.getHours() - 24);

            const staleOrders = await orderDB.find({
                where: {
                    status: OrderStatus.CONFIRMED,
                    paymentStatus: PaymentStatus.UNPAID,
                    createdAt: LessThan(thresholdDate),
                },
                relations: ["orderItems"],
            });

            if (staleOrders.length === 0) return;

            const productRepo = AppDataSource.getRepository(Product);
            const variantRepo = AppDataSource.getRepository(Variant);

            for (const order of staleOrders) {
                // Restore stock for each order item
                for (const item of order.orderItems) {
                    if (item.variantId) {
                        const variant = await variantRepo.findOne({
                            where: { id: item.variantId },
                        });
                        if (variant) {
                            variant.stock += item.quantity;
                            await variantRepo.save(variant);
                        }
                    } else if (item.productId) {
                        const product = await productRepo.findOne({
                            where: { id: item.productId },
                        });
                        if (product && product.stock != null) {
                            product.stock += item.quantity;
                            await productRepo.save(product);
                        }
                    }
                }

                order.status = OrderStatus.CANCELLED;
                order.deliveryStatus = DeliveryStatus.DELIVERY_FAILED;
                await orderDB.save(order);
            }
        } catch (err) {
            // silent fail for cron
        }
    });
};

// set order status to cancelled if the payment is dealyed formore than 15 minutes incase of esewa and nps
export const startOrderCleanupJob = () => {
    cron.schedule("*/5 * * * *", async () => {
        try {
            const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

            const staleOrders = await orderDB.find({
                where: {
                    paymentMethod: In([PaymentMethod.ESEWA, PaymentMethod.NPX]),
                    paymentStatus: PaymentStatus.UNPAID,
                    createdAt: LessThan(fifteenMinutesAgo),
                    status: OrderStatus.PENDING,
                },
                relations: ["orderedBy", "orderItems", "orderItems.vendor"],
            });

            if (!staleOrders.length) return;

            const productRepo = AppDataSource.getRepository(Product);
            const variantRepo = AppDataSource.getRepository(Variant);

            for (const order of staleOrders) {
                // Restore stock before cancelling
                for (const item of order.orderItems) {
                    if (item.variantId) {
                        const variant = await variantRepo.findOne({
                            where: { id: item.variantId },
                        });
                        if (variant) {
                            variant.stock += item.quantity;
                            await variantRepo.save(variant);
                        }
                    } else if (item.productId) {
                        const product = await productRepo.findOne({
                            where: { id: item.productId },
                        });
                        if (product && product.stock != null) {
                            product.stock += item.quantity;
                            await productRepo.save(product);
                        }
                    }
                }

                order.status = OrderStatus.CANCELLED;
                order.deliveryStatus = DeliveryStatus.DELIVERY_FAILED;
                await orderDB.save(order);

                const userEmail = order.orderedBy?.email;
                const orderItems = await orderItemRepo.find({
                    where: { order: { id: order.id } },
                    relations: ["vendor"],
                });
                const vendorEmails = orderItems
                    .map((item) => item.vendor?.email)
                    .filter(Boolean);

                if (userEmail) {
                    await sendOrderStatusEmail(
                        userEmail,
                        order.orderNumber,
                        "Cancelled",
                        `Order #${order.orderNumber} Cancelled - Payment Timeout`,
                    );
                }

                for (const vendorEmail of vendorEmails) {
                    await sendOrderStatusEmail(
                        vendorEmail,
                        order.orderNumber,
                        "Cancelled",
                        `Order #${order.orderNumber} Cancelled by System`,
                    );
                }

                const notificationService = new NotificationService();
                await notificationService.notifyOrderStatusUpdated(order);
            }
        } catch (error) {
            // silent fail for cron
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

export const staleDeviceTokenCleanUp = () => {
    cron.schedule("0 2 * * *", async () => {
        try {
            await deviceTokenService.cleanupStaleTokens();
        } catch (error) {
            // silent fail for cron
        }
    });
};
