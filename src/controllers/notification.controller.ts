import { Request, Response } from "express";
import { CombinedAuthRequest } from "../middlewares/auth.middleware";
import { NotificationService } from "../service/notification.service";
import { APIError } from "../utils/ApiError.utils";

export class NotificationController {
    private notificationService: NotificationService;

    constructor() {
        this.notificationService = new NotificationService()
    }

    async getNotificationController(req: CombinedAuthRequest, res: Response) {
        try {
            const user = req.user;
            const vendor = req.vendor;

            if (!user && !vendor) {
                throw new APIError(401, "Authentication required");
            }

            const notification = await this.notificationService.getNotifications(user || vendor);

            res.status(200).json({
                success: true,
                data: notification
            })

        } catch (error) {
            console.log(error)
            if (error instanceof APIError) {
                res.status(error.status).json({
                    success: false,
                    msg: error.message
                })
            } else {
                res.status(500).json({
                    success: false,
                    msg: "Internal server error"
                })
            }
        }
    }

    async markReadController(req: Request<{ id: string }, {}, {}, {}>, res: Response) {
        try {
            const id = req.params.id;
            const notificationExists = await this.notificationService.getNotificationById(id);

            if (!notificationExists) {
                throw new APIError(404, "Invalid notification id")
            }

            const notification = await this.notificationService.markAsRead(id)

            res.status(200).json({
                success: true,
                msg: "marked as read",
                data: notification
            })
        } catch (error) {
            console.log(error)
            if (error instanceof APIError) {
                res.status(error.status).json({
                    success: false,
                    msg: error.message
                })
            } else {
                res.status(500).json({
                    success: false,
                    msg: "Internal server error"
                })
            }
        }
    }


    async getNotificationByIdController(req: Request<{ id: string }, {}, {}, {}>, res: Response) {
        try {
            const id = req.params.id;

            const notification = await this.notificationService.getNotificationById(id);

            if (!notification) {
                throw new APIError(404, "Notification does not exists")
            }

            res.status(200).json({
                success: true,
                data: notification
            })
        } catch (error) {
            console.log(error)
            if (error instanceof APIError) {
                res.status(error.status).json({
                    success: false,
                    msg: error.message
                })
            } else {
                res.status(500).json({
                    success: false,
                    msg: "Internal server error"
                })
            }
        }
    }
}