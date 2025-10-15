import { In } from "typeorm";
import AppDataSource from "../config/db.config";
import { Notification, NotificationTarget, NotificationType } from "../entities/notification.entity";
import { Vendor } from "../entities/vendor.entity";
import { Order } from "../entities/order.entity";
import { APIError } from "../utils/ApiError.utils";
import { User, UserRole } from "../entities/user.entity";

export class NotificationService {
    private notificationRepo = AppDataSource.getRepository(Notification);
    private vendorRepo = AppDataSource.getRepository(Vendor);
    private orderRepo = AppDataSource.getRepository(Order);


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
            // link: `/admin/orders/${order.id}`,
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
                // link: `/admin/orders/${order.id}`,
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
                    // link: `/vendor/orders/${order.id}`,
                })
            );
        }

        await this.notificationRepo.save(notifications);
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