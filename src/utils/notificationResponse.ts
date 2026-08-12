import {
  Notification,
  NotificationTarget,
  NotificationType,
} from "../entities/notification.entity";

type NotificationOrder = {
  id?: number;
  orderNumber?: string | null;
  status?: string | null;
};

type NotificationWithOrder = Notification & { order?: NotificationOrder | null };

export type NotificationResponse = {
  id: string;
  title: string;
  message: string;
  /** Compatibility alias for clients that use the FCM field name. */
  body: string;
  type: NotificationType;
  target: NotificationTarget;
  isRead: boolean;
  orderId?: number;
  createdAt: Date;
  updatedAt: Date;
};

const textOrEmpty = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const orderLabel = (notification: NotificationWithOrder): string =>
  String(notification.order?.orderNumber || notification.orderId || "");

const fallbackTitle = (notification: NotificationWithOrder): string => {
  if (notification.type === NotificationType.ORDER_PLACED) {
    return notification.target === NotificationTarget.VENDOR
      ? "New Order Received"
      : "New Order Placed";
  }
  if (notification.type === NotificationType.ORDER_STATUS_UPDATED) {
    return notification.target === NotificationTarget.VENDOR
      ? "Order Status Changed"
      : "Order Status Updated";
  }
  return "Notification";
};

const fallbackMessage = (notification: NotificationWithOrder): string => {
  const order = orderLabel(notification);
  if (notification.type === NotificationType.ORDER_PLACED && order) {
    return notification.target === NotificationTarget.VENDOR
      ? `You have received a new order #${order}`
      : `Order #${order} has been placed`;
  }
  if (notification.type === NotificationType.ORDER_STATUS_UPDATED && order) {
    const status = textOrEmpty(notification.order?.status);
    return `Order #${order} status updated${status ? ` to ${status}` : ""}`;
  }
  return "You have a new notification.";
};

export const serializeNotification = (
  notification: NotificationWithOrder,
): NotificationResponse => {
  const title = textOrEmpty(notification.title) || fallbackTitle(notification);
  const message = textOrEmpty(notification.message) || fallbackMessage(notification);

  return {
    id: notification.id,
    title,
    message,
    body: message,
    type: notification.type,
    target: notification.target,
    isRead: Boolean(notification.isRead),
    ...(notification.orderId !== undefined && { orderId: notification.orderId }),
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };
};
