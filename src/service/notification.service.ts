import { In } from "typeorm";
import AppDataSource from "../config/db.config";
import { Notification, NotificationTarget, NotificationType } from "../entities/notification.entity";
import { Vendor } from "../entities/vendor.entity";
import { Order } from "../entities/order.entity";
import { APIError } from "../utils/ApiError.utils";
import { User, UserRole } from "../entities/user.entity";
import { sendToTokens, PushPayload } from "../utils/fcm.utils";
import { deviceTokenService, OwnerType } from "./deviceToken.service";
import { DevicePlatform } from "../entities/deviceToken.entity";
import { RegisterDeviceInput } from "../utils/zod_validations/push.zod";

export class NotificationService {
    private notificationRepo = AppDataSource.getRepository(Notification);
    private vendorRepo = AppDataSource.getRepository(Vendor);
    private orderRepo = AppDataSource.getRepository(Order);
    private userRepo = AppDataSource.getRepository(User);

    /**
     * Sends and reaps dead tokens in one step. Every automated push in this
     * service goes through here, so invalid tokens get retired no matter which
     * business event triggered the send.
     */
    private async push(tokens: string[], payload: PushPayload): Promise<void> {
        if (!tokens.length) return;
        const result = await sendToTokens(tokens, payload);
        await deviceTokenService.deactivateTokens(result.invalidTokens);
    }

    /** Active device tokens for every admin and staff account. */
    private async adminTokens(): Promise<string[]> {
        const admins = await this.userRepo.find({
            where: [{ role: UserRole.ADMIN }, { role: UserRole.STAFF }],
            select: { id: true },
        });
        return deviceTokenService.getTokensForUsers(admins.map((a) => a.id));
    }


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
        await this.push(await this.adminTokens(), {
            title: "New Order Placed",
            body: `Order #${order.id} placed by ${fullName}`,
            data: { type: "ORDER_PLACED", orderId: String(order.id) },
        });

        // One batched send for all vendors on the order, not one per vendor.
        await this.push(await deviceTokenService.getTokensForVendors(vendorIds), {
            title: "New Order Received",
            body: `You have received a new order #${order.id}`,
            data: { type: "ORDER_PLACED", orderId: String(order.id) },
        });
    }

    async notifyOrderStatusUpdated(order: any): Promise<void> {
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
        const vendorIds = [...new Set(order.orderItems.map((item: any) => item.vendorId ?? item.vendor?.id).filter(Boolean))] as number[];

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
        const data = { type: "ORDER_STATUS_UPDATED", orderId: String(order.id) };

        await this.push(await this.adminTokens(), {
            title: "Order Status Updated",
            body: statusMessage,
            data,
        });

        await this.push(await deviceTokenService.getTokensForVendors(vendorIds), {
            title: "Order Status Changed",
            body: statusMessage,
            data,
        });

        // Send to the user who placed the order
        if (order.orderedBy) {
            await this.push(await deviceTokenService.getTokensForUser(order.orderedBy.id), {
                title: "Your Order Status Updated",
                body: statusMessage,
                data,
            });
        }
    }


    /** Feed row + push for a payment outcome. The three payment states differ only in copy. */
    private async notifyPaymentOutcome(
        orderId: number,
        userId: number,
        title: string,
        feedMessage: string,
        pushBody: string,
        dataType: string,
    ): Promise<void> {
        const user = await this.userRepo.findOne({ where: { id: userId }, select: { id: true } });
        if (!user) return;

        await this.notificationRepo.save(
            this.notificationRepo.create({
                title,
                message: feedMessage,
                type: NotificationType.ORDER_STATUS_UPDATED,
                target: NotificationTarget.USER,
                orderId,
                createdById: userId,
            })
        );

        await this.push(await deviceTokenService.getTokensForUser(userId), {
            title,
            body: pushBody,
            data: { type: dataType, orderId: String(orderId) },
        });
    }

    async notifyPaymentSuccess(orderId: number, userId: number): Promise<void> {
        return this.notifyPaymentOutcome(
            orderId,
            userId,
            "Payment Successful",
            `Your payment for Order #${orderId} was successful. Your order is confirmed!`,
            `Your payment for Order #${orderId} was successful!`,
            "PAYMENT_SUCCESS",
        );
    }

    async notifyPaymentFailed(orderId: number, userId: number): Promise<void> {
        const message = `Your payment for Order #${orderId} failed. Please try again.`;
        return this.notifyPaymentOutcome(
            orderId,
            userId,
            "Payment Failed",
            message,
            message,
            "PAYMENT_FAILED",
        );
    }

    async notifyPaymentCancelled(orderId: number, userId: number): Promise<void> {
        const message = `Your payment for Order #${orderId} was cancelled.`;
        return this.notifyPaymentOutcome(
            orderId,
            userId,
            "Payment Cancelled",
            message,
            message,
            "PAYMENT_CANCELLED",
        );
    }

    async notifyAddToCart(userId: number, productName: string): Promise<void> {
        await this.push(await deviceTokenService.getTokensForUser(userId), {
            title: "Added to Cart",
            body: `${productName} has been added to your cart.`,
            data: { type: "ADD_TO_CART" },
        });
    }

    async notifyAddToWishlist(userId: number, productName: string): Promise<void> {
        await this.push(await deviceTokenService.getTokensForUser(userId), {
            title: "Added to Wishlist",
            body: `${productName} has been saved to your wishlist.`,
            data: { type: "ADD_TO_WISHLIST" },
        });
    }

    /**
     * Registers a device for push.
     *
     * The live Flutter app posts `{ token }` only. Those callers get a single
     * synthetic device slot per account — identical to the old one-column
     * behaviour, so nothing regresses. Clients that send deviceId + platform get
     * real multi-device support.
     */
    async saveFcmToken(
        ownerId: number,
        ownerType: OwnerType,
        input: Partial<RegisterDeviceInput> & { fcmToken: string },
    ): Promise<void> {
        await deviceTokenService.registerOrUpdate(ownerType, ownerId, {
            fcmToken: input.fcmToken,
            deviceId: input.deviceId ?? `legacy-${ownerType}-${ownerId}`,
            platform: input.platform ?? DevicePlatform.ANDROID,
            appVersion: input.appVersion,
            deviceModel: input.deviceModel,
            osVersion: input.osVersion,
        });
    }

    async removeFcmDevice(ownerId: number, ownerType: OwnerType, deviceId: string): Promise<boolean> {
        return deviceTokenService.deactivateDevice(ownerType, ownerId, deviceId);
    }

    async markAsRead(notificationId: string): Promise<void> {
        await this.notificationRepo.update(notificationId, { isRead: true });
    }

    async getNotificationById(id: string) {
        return await this.notificationRepo.findOne({
            where: { id }
        })
    }

    /**
     * Whether this caller is allowed to see/act on this notification.
     *
     * Mirrors the filters in getNotifications(). Without it, /:id is an IDOR —
     * the row is fetched by primary key alone, so any authenticated account
     * could read anyone else's notifications (and the ADMIN feed) by id.
     */
    canAccess(notification: Notification, authEntity: User | Vendor): boolean {
        if (!authEntity) return false;

        if (authEntity instanceof Vendor) {
            return (
                notification.target === NotificationTarget.VENDOR &&
                notification.vendorId === authEntity.id
            );
        }

        if (authEntity instanceof User) {
            if (authEntity.role === UserRole.ADMIN || authEntity.role === UserRole.STAFF) {
                return notification.target === NotificationTarget.ADMIN;
            }
            return (
                notification.target === NotificationTarget.USER &&
                notification.createdById === authEntity.id
            );
        }

        return false;
    }
}
