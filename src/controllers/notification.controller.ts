import { Request, Response, NextFunction } from "express";
import { CombinedAuthRequest } from "../middlewares/auth.middleware";
import { NotificationService } from "../service/notification.service";
import { NotFoundError } from "../errors";

export class NotificationController {
    private notificationService: NotificationService;

    constructor() {
        this.notificationService = new NotificationService();
    }

    async getNotificationController(req: CombinedAuthRequest, res: Response, _next: NextFunction) {
        const notification = await this.notificationService.getNotifications(req.user || req.vendor);
        res.status(200).json({ success: true, data: notification });
    }

    async markReadController(req: Request<{ id: string }, {}, {}, {}>, res: Response, _next: NextFunction) {
        const id = req.params.id;
        const notificationExists = await this.notificationService.getNotificationById(id);
        if (!notificationExists) throw new NotFoundError("Notification");

        const notification = await this.notificationService.markAsRead(id);
        res.status(200).json({ success: true, msg: "marked as read", data: notification });
    }

    async saveFcmTokenController(req: CombinedAuthRequest, res: Response, _next: NextFunction) {
        const { token } = req.body as { token: string };
        if (req.user) {
            await this.notificationService.saveFcmToken(req.user.id, token, "user");
        } else {
            await this.notificationService.saveFcmToken(req.vendor.id, token, "vendor");
        }
        res.status(200).json({ success: true, msg: "FCM token saved" });
    }

    async getNotificationByIdController(req: Request<{ id: string }, {}, {}, {}>, res: Response, _next: NextFunction) {
        const notification = await this.notificationService.getNotificationById(req.params.id);
        if (!notification) throw new NotFoundError("Notification");
        res.status(200).json({ success: true, data: notification });
    }
}
