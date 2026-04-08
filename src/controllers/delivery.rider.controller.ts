import { Response } from "express";
import { DeliveryRiderService } from "../service/delivery.rider.service";
import { RiderAuthRequest } from "../middlewares/auth.middleware";

export class DeliveryRiderController {
    private deliveryRiderService: DeliveryRiderService;

    constructor() {
        this.deliveryRiderService = new DeliveryRiderService();
    }

    //  RIDER ACTIONS

    async getRiderAssignments(req: RiderAuthRequest, res: Response) {
        const rider = req.rider;

        const assignments = await this.deliveryRiderService.getRiderAssignments(
            rider.id,
        );
        res.status(200).json({ success: true, data: assignments });
    }

    async confirmPickup(req: RiderAuthRequest<{ orderId: string }>, res: Response) {
        const orderId = Number(req.params.orderId);

        const rider = req.rider;

        const assignment = await this.deliveryRiderService.confirmPickup(
            orderId,
            rider.id,
        );
        res.status(200).json({ success: true, data: assignment });
    }

    async markDelivered(
        req: RiderAuthRequest<{ orderId: string }>,
        res: Response,
    ): Promise<void> {
        const orderId = Number(req.params.orderId);

        const rider = req.rider;

        const assignment = await this.deliveryRiderService.markDelivered(
            orderId,
            rider.id,
        );
        res.status(200).json({ success: true, data: assignment });
    }

    async markDeliveryFailed(
        req: RiderAuthRequest<{ orderId: string }>,
        res: Response,
    ): Promise<void> {
        const orderId = Number(req.params.orderId);

        const rider = req.rider;

        const assignment = await this.deliveryRiderService.markDeliveryFailed(
            orderId,
            rider.id,
            req.body,
        );
        res.status(200).json({ success: true, data: assignment });
    }
}
