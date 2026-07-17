import { Request, Response, NextFunction } from "express";
import { AuthRequest, CombinedAuthRequest } from "../middlewares/auth.middleware";
import { NotificationService } from "../service/notification.service";
import { pushService } from "../service/push.service";
import { NotFoundError } from "../errors";
import {
    RegisterDeviceInput,
    SendToUserInput,
    SendToUsersInput,
    SendToTopicInput,
    DispatchQueryInput,
} from "../utils/zod_validations/push.zod";

export class NotificationController {
    private notificationService: NotificationService;

    constructor() {
        this.notificationService = new NotificationService();
    }

    async getNotificationController(req: CombinedAuthRequest, res: Response, _next: NextFunction) {
        const notification = await this.notificationService.getNotifications(req.user || req.vendor);
        res.status(200).json({ success: true, data: notification });
    }

    async markReadController(req: CombinedAuthRequest<{ id: string }>, res: Response, _next: NextFunction) {
        const id = req.params.id;
        const notification = await this.notificationService.getNotificationById(id);
        if (!notification) throw new NotFoundError("Notification");

        // 404 rather than 403: a 403 would confirm the id exists to someone who
        // has no business knowing that.
        if (!this.notificationService.canAccess(notification, req.user || req.vendor)) {
            throw new NotFoundError("Notification");
        }

        await this.notificationService.markAsRead(id);
        res.status(200).json({ success: true, msg: "marked as read", data: { id, isRead: true } });
    }

    /**
     * Accepts both the legacy `{ token }` body the live app sends and the full
     * device payload. Validation is deliberately not a zod middleware here —
     * the legacy shape has no deviceId/platform and must keep working.
     */
    async saveFcmTokenController(req: CombinedAuthRequest, res: Response, _next: NextFunction) {
        const body = req.body as Partial<RegisterDeviceInput> & { token?: string };
        const fcmToken = body.fcmToken ?? body.token;

        if (!fcmToken || fcmToken.length < 20) {
            return res.status(400).json({ success: false, error: "Valid FCM token is required" });
        }

        const ownerId = req.user ? req.user.id : req.vendor.id;
        const ownerType = req.user ? "user" : "vendor";

        await this.notificationService.saveFcmToken(ownerId, ownerType, { ...body, fcmToken });
        res.status(200).json({ success: true, msg: "FCM token saved" });
    }

    /** Logout of one device — stops push without touching the account's other devices. */
    async removeFcmDeviceController(
        req: CombinedAuthRequest<{ deviceId: string }>,
        res: Response,
        _next: NextFunction,
    ) {
        const ownerId = req.user ? req.user.id : req.vendor.id;
        const ownerType = req.user ? "user" : "vendor";

        const removed = await this.notificationService.removeFcmDevice(
            ownerId,
            ownerType,
            req.params.deviceId,
        );
        if (!removed) throw new NotFoundError("Device");

        res.status(200).json({ success: true, msg: "Device unregistered" });
    }

    async getNotificationByIdController(req: CombinedAuthRequest<{ id: string }>, res: Response, _next: NextFunction) {
        const notification = await this.notificationService.getNotificationById(req.params.id);
        if (!notification) throw new NotFoundError("Notification");

        if (!this.notificationService.canAccess(notification, req.user || req.vendor)) {
            throw new NotFoundError("Notification");
        }

        res.status(200).json({ success: true, data: notification });
    }

    // ── Admin push ───────────────────────────────────────────────────────────

    async sendToUserController(
        req: AuthRequest<{}, {}, SendToUserInput>,
        res: Response,
        _next: NextFunction,
    ) {
        const dispatch = await pushService.sendToUser(req.body, req.user.id);
        res.status(200).json({ success: true, message: "Notification dispatched", data: dispatch });
    }

    async sendToUsersController(
        req: AuthRequest<{}, {}, SendToUsersInput>,
        res: Response,
        _next: NextFunction,
    ) {
        const dispatch = await pushService.sendToUsers(req.body, req.user.id);
        res.status(200).json({ success: true, message: "Notification dispatched", data: dispatch });
    }

    async sendToTopicController(
        req: AuthRequest<{}, {}, SendToTopicInput>,
        res: Response,
        _next: NextFunction,
    ) {
        const dispatch = await pushService.sendToTopic(req.body, req.user.id);
        res.status(200).json({ success: true, message: "Topic notification dispatched", data: dispatch });
    }

    async getDispatchHistoryController(
        req: AuthRequest<{}, {}, {}, DispatchQueryInput>,
        res: Response,
        _next: NextFunction,
    ) {
        const result = await pushService.getHistory(req.query);
        res.status(200).json({ success: true, ...result });
    }

    async getPushStatsController(req: AuthRequest, res: Response, _next: NextFunction) {
        const stats = await pushService.getStats();
        res.status(200).json({ success: true, data: stats });
    }
}
