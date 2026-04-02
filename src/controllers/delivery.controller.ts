import { Request, Response } from "express";
import { DeliveryService } from "../service/delivery.service";
import { RiderAuthRequest } from "../middlewares/auth.middleware";
import { APIError } from "../utils/ApiError.utils";
import { CreateRiderType } from "../utils/zod_validations/delivery.zod";

export class DeliveryController {
    private deliveryService: DeliveryService;

    constructor() {
        this.deliveryService = new DeliveryService();
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

    //  RIDER MANAGEMENT

    async createRider(req: Request<{}, {}, CreateRiderType>, res: Response) {
        try {
            const rider = await this.deliveryService.createRider(req.body);

            res.status(201).json({
                success: true,
                data: rider,
            });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async getAllRiders(req: Request, res: Response) {
        try {
            const riders = await this.deliveryService.getAllRiders();
            res.status(200).json({ success: true, data: riders });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async getRiderById(req: Request<{ riderId: string }>, res: Response) {
        try {
            const riderId = Number(req.params.riderId);

            const rider = await this.deliveryService.getRiderById(riderId);
            res.status(200).json({ success: true, data: rider });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async resetRiderPassword(req: Request<{ riderId: string }>, res: Response) {
        try {
            const riderId = Number(req.params.riderId);

            const { message } = await this.deliveryService.resetRiderPassword(
                riderId,
                req.body.newPassword,
            );

            res.status(200).json({ success: true, message });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    //  ORDER PROCESSING

    async getProcessingOrders(req: Request, res: Response) {
        try {
            const orders = await this.deliveryService.getProcessingOrders();

            return res.status(200).json({ success: true, data: orders });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async getProcessingOrderById(req: Request<{ orderId: string }>, res: Response) {
        try {
            const orderId = Number(req.params.orderId);

            const order =
                await this.deliveryService.getProcessingOrderById(orderId);

            return res.status(200).json({ success: true, data: order });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async markAtWarehouse(req: Request<{ orderId: string }>, res: Response) {
        try {

            const orderId = Number(req.params.orderId);

            const order = await this.deliveryService.markAtWarehouse(orderId);
            res.status(200).json({ success: true, data: order });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async collectOrderItems(req: Request<{ orderItemId: string }>, res: Response) {
        try {
            const orderItemId = Number(req.params.orderItemId);

            await this.deliveryService.collectOrderItems(orderItemId);

            res.status(201).json({
                success: true,
                message: "Order Item Collected",
            });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async getWarehouseOrderQueue(req: Request, res: Response) {
        try {
            const page = Number(req.query.page as string) || 1;
            const limit = Number(req.query.limit as string) || 20;

            const result = await this.deliveryService.getWarehouseOrderQueue(
                page,
                limit,
            );
            res.status(200).json({ success: true, data: result });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    //  ASSIGNMENTS

    async assignRider(req: Request<{ orderId: string }>, res: Response) {
        try {
            const orderId = Number(req.params.orderId);

            const assignment = await this.deliveryService.assignRider(
                orderId,
                req.body,
            );
            res.status(200).json({ success: true, data: assignment });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async getAllAssignments(req: Request, res: Response) {
        try {
            const page = Number(req.query.page as string) || 1;
            const limit = Number(req.query.limit as string) || 20;

            const result = await this.deliveryService.getAllAssignments(
                page,
                limit,
            );
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async findOrderAssignment(req: Request<{ orderId: string }>, res: Response) {
        try {
            const orderId = Number(req.params.orderId);

            const assignments =
                await this.deliveryService.findOrderAssignment(orderId);

            return res.status(200).json({ success: true, data: assignments });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    //  RIDER ACTIONS

    async getRiderAssignments(req: RiderAuthRequest, res: Response) {
        try {
            const rider = req.rider;

            const assignments = await this.deliveryService.getRiderAssignments(
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

            const assignment = await this.deliveryService.confirmPickup(
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

            const assignment = await this.deliveryService.markDelivered(
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

            const assignment = await this.deliveryService.markDeliveryFailed(
                orderId,
                rider.id,
                req.body,
            );
            res.status(200).json({ success: true, data: assignment });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async resetToWarehouse(
        req: Request<{ orderId: string }>,
        res: Response,
    ): Promise<void> {
        try {
            const orderId = Number(req.params.orderId);

            const order = await this.deliveryService.backToWarehouse(orderId);
            res.status(200).json({ success: true, data: order });
        } catch (error) {
            this.handleError(res, error);
        }
    }
}
