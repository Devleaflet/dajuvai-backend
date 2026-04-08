import { Response } from "express";
import { DeliveryRiderService } from "../service/delivery.rider.service";
import { RiderAuthRequest } from "../middlewares/auth.middleware";
import { APIError } from "../utils/ApiError.utils";

export class DeliveryRiderController {
    private deliveryRiderService: DeliveryRiderService;

    constructor() {
        this.deliveryRiderService = new DeliveryRiderService();
    }

    private handleError(res: Response, error: unknown) {
        console.error("[ ERROR ] : ", error);
        if (error instanceof APIError) {
            res.status(error.status).json({
                success: false,
                message: error.message,
            });
        } else {
            res.status(500).json({
                success: false,
                message: "Internal Server Error",
            });
        }
    }

    //  RIDER ACTIONS

    async getRiderAssignments(req: RiderAuthRequest, res: Response) {
        try {
            const rider = req.rider;

            const assignments = await this.deliveryRiderService.getRiderAssignments(
                rider.id,
            );
            res.status(200).json({ success: true, data: assignments });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async confirmPickup(req: RiderAuthRequest<{ orderId: string }>, res: Response) {
        try {
            const orderId = Number(req.params.orderId);
            

            const rider = req.rider;

            const assignment = await this.deliveryRiderService.confirmPickup(
                orderId,
                rider.id,
            );
            res.status(200).json({ success: true, data: assignment });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async markDelivered(
        req: RiderAuthRequest<{ orderId: string }>,
        res: Response,
    ): Promise<void> {
        try {
            
            const orderId = Number(req.params.orderId);
            

            const rider = req.rider;

            const assignment = await this.deliveryRiderService.markDelivered(
                orderId,
                rider.id,
            );
            res.status(200).json({ success: true, data: assignment });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async markDeliveryFailed(
        req: RiderAuthRequest<{ orderId: string }>,
        res: Response,
    ): Promise<void> {
        try {
            const orderId = Number(req.params.orderId);

            const rider = req.rider;

            const assignment = await this.deliveryRiderService.markDeliveryFailed(
                orderId,
                rider.id,
                req.body,
            );
            res.status(200).json({ success: true, data: assignment });
        } catch (error) {
            this.handleError(res, error);
        }
    }
}
