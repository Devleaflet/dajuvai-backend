import { In } from "typeorm";
import AppDataSource from "../config/db.config";
import { Notification, NotificationTarget, NotificationType } from "../entities/notification.entity";
import { Vendor } from "../entities/vendor.entity";
import { Order } from "../entities/order.entity";
import { APIError } from "../utils/ApiError.utils";
import { User, UserRole } from "../entities/user.entity";
import { sendPushNotification, sendPushToMultiple } from "../utils/fcm.utils";

export class NotificationService {
    private notificationRepo = AppDataSource.getRepository(Notification);
    private vendorRepo = AppDataSource.getRepository(Vendor);
    private orderRepo = AppDataSource.getRepository(Order);
    private userRepo = AppDataSource.getRepository(User);


    async getNotifications(authEntity: User | Vendor): Promise<Notification[]> {
        if (!authEntity) {
            throw new APIError(401, "Not authenticated");
        }

        // ADMIN & STAFF (from User)
        if (authEntity instanceof User &&
            (authEntity.role === UserRole.ADMIN || authEntity.role === UserRole.STAFF)) {
            return this.notificationRepo.find({
                where: { target: NotificationTarget.ADMIN },
                order: { createdAt: "DESC" },
            });
        }

        //  VENDOR
        if (authEntity instanceof Vendor) {
            return this.notificationRepo.find({
                where: {
                    target: NotificationTarget.VENDOR,
                    vendorId: authEntity.id,
                },
                order: { createdAt: "DESC" },
            });
        }

        // 👤 REGULAR USER
        if (authEntity instanceof User && authEntity.role === UserRole.USER) {
            return this.notificationRepo.find({
                where: {
                    target: NotificationTarget.USER,
                    createdById: authEntity.id,
                },
                order: { createdAt: "DESC" },
            });
        }

        throw new APIError(403, "Invalid or unauthorized role");
    }


    async notifyOrderPlaced(order: Order): Promise<void> {
        console.log("____________Order---------------")
        console.log(order)
        const notifications: Notification[] = [];

        const orders = this.orderRepo.findOne({
            where: { id: order.id },
            relations: ["orderedBy"]
        })
        const fullName = (await orders).orderedBy.fullName

        // Notify Admin
        const adminNotification = this.notificationRepo.create({
            title: "New Order Placed",
            message: `Order #${order.id} has been placed by ${fullName}`,
            type: NotificationType.ORDER_PLACED,
            target: NotificationTarget.ADMIN,
            orderId: order.id,
            createdById: (await orders).orderedBy.id,
        });
        notifications.push(adminNotification);

        // Notify Vendors involved
        const vendorIds = [...new Set(order.orderItems.map(item => item.vendorId))];

        const vendors = await this.vendorRepo.find({
            where: { id: In(vendorIds) },
        });

        for (const vendor of vendors) {
            notifications.push(
                this.notificationRepo.create({
                    title: "New Order Received",
                    message: `You have received a new order #${order.id}`,
                    type: NotificationType.ORDER_PLACED,
                    target: NotificationTarget.VENDOR,
                    vendorId: vendor.id,
                    orderId: order.id,
                    createdById: (await orders).orderedBy.id,
                })
            );
        }

        await this.notificationRepo.save(notifications);

        // --- Push Notifications ---
        // Send to all admins
        const admins = await this.userRepo.find({
            where: [{ role: UserRole.ADMIN }, { role: UserRole.STAFF }],
        });
        const adminTokens = admins.map(a => a.fcmToken).filter(Boolean) as string[];
        await sendPushToMultiple(adminTokens, "New Order Placed", `Order #${order.id} placed by ${fullName}`, {
            type: "ORDER_PLACED",
            orderId: String(order.id),
        });

        // Send to each vendor
        for (const vendor of vendors) {
            if (vendor.fcmToken) {
                await sendPushNotification(
                    vendor.fcmToken,
                    "New Order Received",
                    `You have received a new order #${order.id}`,
                    { type: "ORDER_PLACED", orderId: String(order.id) }
                );
            }
        }
    }

    async notifyOrderStatusUpdated(order: Order): Promise<void> {
        const notifications: Notification[] = [];

        const statusMessage = `Order #${order.id} status updated to ${order.status}`;

        // Admin notification
        notifications.push(
            this.notificationRepo.create({
                title: "Order Status Updated",
                message: statusMessage,
                type: NotificationType.ORDER_STATUS_UPDATED,
                target: NotificationTarget.ADMIN,
                orderId: order.id,
            })
        );

        // Vendor notifications
        const vendorIds = [...new Set(order.orderItems.map(item => item.vendorId))];

        for (const vendorId of vendorIds) {
            notifications.push(
                this.notificationRepo.create({
                    title: "Order Status Changed",
                    message: statusMessage,
                    type: NotificationType.ORDER_STATUS_UPDATED,
                    target: NotificationTarget.VENDOR,
                    vendorId,
                    orderId: order.id,
                })
            );
        }

        // User notification
        if (order.orderedBy) {
            notifications.push(
                this.notificationRepo.create({
                    title: "Order Status Updated",
                    message: statusMessage,
                    type: NotificationType.ORDER_STATUS_UPDATED,
                    target: NotificationTarget.USER,
                    orderId: order.id,
                    createdById: order.orderedBy.id,
                })
            );
        }

        await this.notificationRepo.save(notifications);

        // --- Push Notifications ---
        // Send to all admins
        const admins = await this.userRepo.find({
            where: [{ role: UserRole.ADMIN }, { role: UserRole.STAFF }],
        });
        const adminTokens = admins.map(a => a.fcmToken).filter(Boolean) as string[];
        await sendPushToMultiple(adminTokens, "Order Status Updated", statusMessage, {
            type: "ORDER_STATUS_UPDATED",
            orderId: String(order.id),
        });

        // Send to vendors
        const vendors = await this.vendorRepo.find({ where: { id: In(vendorIds) } });
        for (const vendor of vendors) {
            if (vendor.fcmToken) {
                await sendPushNotification(
                    vendor.fcmToken,
                    "Order Status Changed",
                    statusMessage,
                    { type: "ORDER_STATUS_UPDATED", orderId: String(order.id) }
                );
            }
        }

        // Send to the user who placed the order
        if (order.orderedBy?.fcmToken) {
            await sendPushNotification(
                order.orderedBy.fcmToken,
                "Your Order Status Updated",
                statusMessage,
                { type: "ORDER_STATUS_UPDATED", orderId: String(order.id) }
            );
        }
    }


    async notifyPaymentSuccess(orderId: number, userId: number): Promise<void> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) return;

        await this.notificationRepo.save(
            this.notificationRepo.create({
                title: "Payment Successful",
                message: `Your payment for Order #${orderId} was successful. Your order is confirmed!`,
                type: NotificationType.ORDER_STATUS_UPDATED,
                target: NotificationTarget.USER,
                orderId,
                createdById: userId,
            })
        );

        if (user.fcmToken) {
            await sendPushNotification(
                user.fcmToken,
                "Payment Successful",
                `Your payment for Order #${orderId} was successful!`,
                { type: "PAYMENT_SUCCESS", orderId: String(orderId) }
            );
        }
    }

    async notifyPaymentFailed(orderId: number, userId: number): Promise<void> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) return;

        await this.notificationRepo.save(
            this.notificationRepo.create({
                title: "Payment Failed",
                message: `Your payment for Order #${orderId} failed. Please try again.`,
                type: NotificationType.ORDER_STATUS_UPDATED,
                target: NotificationTarget.USER,
                orderId,
                createdById: userId,
            })
        );

        if (user.fcmToken) {
            await sendPushNotification(
                user.fcmToken,
                "Payment Failed",
                `Your payment for Order #${orderId} failed. Please try again.`,
                { type: "PAYMENT_FAILED", orderId: String(orderId) }
            );
        }
    }

    async notifyPaymentCancelled(orderId: number, userId: number): Promise<void> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user) return;

        await this.notificationRepo.save(
            this.notificationRepo.create({
                title: "Payment Cancelled",
                message: `Your payment for Order #${orderId} was cancelled.`,
                type: NotificationType.ORDER_STATUS_UPDATED,
                target: NotificationTarget.USER,
                orderId,
                createdById: userId,
            })
        );

        if (user.fcmToken) {
            await sendPushNotification(
                user.fcmToken,
                "Payment Cancelled",
                `Your payment for Order #${orderId} was cancelled.`,
                { type: "PAYMENT_CANCELLED", orderId: String(orderId) }
            );
        }
    }

    async notifyAddToCart(userId: number, productName: string): Promise<void> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user?.fcmToken) return;

        await sendPushNotification(
            user.fcmToken,
            "Added to Cart",
            `${productName} has been added to your cart.`,
            { type: "ADD_TO_CART" }
        );
    }

    async notifyAddToWishlist(userId: number, productName: string): Promise<void> {
        const user = await this.userRepo.findOne({ where: { id: userId } });
        if (!user?.fcmToken) return;

        await sendPushNotification(
            user.fcmToken,
            "Added to Wishlist",
            `${productName} has been saved to your wishlist.`,
            { type: "ADD_TO_WISHLIST" }
        );
    }

    async saveFcmToken(userId: number, token: string, entityType: "user" | "vendor"): Promise<void> {
        if (entityType === "user") {
            await this.userRepo.update(userId, { fcmToken: token });
        } else {
            await this.vendorRepo.update(userId, { fcmToken: token });
        }
    }

    async markAsRead(notificationId: string): Promise<void> {
        await this.notificationRepo.update(notificationId, { isRead: true });
    }

    async getNotificationById(id: string) {
        return await this.notificationRepo.findOne({
            where: { id }
        })
    }
}
