import { Request, Response, NextFunction } from "express";
import { DeliveryService } from "../service/delivery.service";
import { RiderAuthRequest } from "../middlewares/auth.middleware";
import { CreateRiderType } from "../utils/zod_validations/delivery.zod";

export class DeliveryController {
    private deliveryService: DeliveryService;

    constructor() {
        this.deliveryService = new DeliveryService();
    }

    //  RIDER MANAGEMENT

    async createRider(req: Request<{}, {}, CreateRiderType>, res: Response, _next: NextFunction): Promise<void> {
        const rider = await this.deliveryService.createRider(req.body);
        res.status(201).json({ success: true, data: rider });
    }

    async getAllRiders(_req: Request, res: Response, _next: NextFunction): Promise<void> {
        const riders = await this.deliveryService.getAllRiders();
        res.status(200).json({ success: true, data: riders });
    }

    async getRiderById(req: Request<{ riderId: string }>, res: Response, _next: NextFunction): Promise<void> {
        const rider = await this.deliveryService.getRiderById(Number(req.params.riderId));
        res.status(200).json({ success: true, data: rider });
    }

    async resetRiderPassword(req: Request<{ riderId: string }>, res: Response, _next: NextFunction): Promise<void> {
        const { message } = await this.deliveryService.resetRiderPassword(
            Number(req.params.riderId),
            req.body.newPassword,
        );
        res.status(200).json({ success: true, message });
    }

    //  ORDER PROCESSING

    async getProcessingOrders(_req: Request, res: Response, _next: NextFunction): Promise<void> {
        const orders = await this.deliveryService.getProcessingOrders();
        res.status(200).json({ success: true, data: orders });
    }

    async getProcessingOrderById(req: Request<{ orderId: string }>, res: Response, _next: NextFunction): Promise<void> {
        const order = await this.deliveryService.getProcessingOrderById(Number(req.params.orderId));
        res.status(200).json({ success: true, data: order });
    }

    async markAtWarehouse(req: Request<{ orderId: string }>, res: Response, _next: NextFunction): Promise<void> {
        const order = await this.deliveryService.markAtWarehouse(Number(req.params.orderId));
        res.status(200).json({ success: true, data: order });
    }

    async collectOrderItems(req: Request<{ orderItemId: string }>, res: Response, _next: NextFunction): Promise<void> {
        await this.deliveryService.collectOrderItems(Number(req.params.orderItemId));
        res.status(201).json({ success: true, message: "Order Item Collected" });
    }

    async getWarehouseOrderQueue(req: Request, res: Response, _next: NextFunction): Promise<void> {
        const page = Number(req.query.page as string) || 1;
        const limit = Number(req.query.limit as string) || 20;
        const result = await this.deliveryService.getWarehouseOrderQueue(page, limit);
        res.status(200).json({ success: true, data: result });
    }

    //  ASSIGNMENTS

    async assignRider(req: Request<{ orderId: string }>, res: Response, _next: NextFunction): Promise<void> {
        const assignment = await this.deliveryService.assignRider(Number(req.params.orderId), req.body);
        res.status(200).json({ success: true, data: assignment });
    }

    async getAllAssignments(req: Request, res: Response, _next: NextFunction): Promise<void> {
        const page = Number(req.query.page as string) || 1;
        const limit = Number(req.query.limit as string) || 20;
        const result = await this.deliveryService.getAllAssignments(page, limit);
        res.status(200).json({ success: true, ...result });
    }

    async findOrderAssignment(req: Request<{ orderId: string }>, res: Response, _next: NextFunction): Promise<void> {
        const assignments = await this.deliveryService.findOrderAssignment(Number(req.params.orderId));
        res.status(200).json({ success: true, data: assignments });
    }

    //  RIDER ACTIONS

    async getRiderAssignments(req: RiderAuthRequest, res: Response, _next: NextFunction): Promise<void> {
        const assignments = await this.deliveryService.getRiderAssignments(req.rider.id);
        res.status(200).json({ success: true, data: assignments });
    }

    async confirmPickup(req: RiderAuthRequest<{ orderId: string }>, res: Response, _next: NextFunction): Promise<void> {
        const assignment = await this.deliveryService.confirmPickup(Number(req.params.orderId), req.rider.id);
        res.status(200).json({ success: true, data: assignment });
    }

    async markDelivered(req: RiderAuthRequest<{ orderId: string }>, res: Response, _next: NextFunction): Promise<void> {
        const assignment = await this.deliveryService.markDelivered(Number(req.params.orderId), req.rider.id);
        res.status(200).json({ success: true, data: assignment });
    }

    async markDeliveryFailed(req: RiderAuthRequest<{ orderId: string }>, res: Response, _next: NextFunction): Promise<void> {
        const assignment = await this.deliveryService.markDeliveryFailed(
            Number(req.params.orderId),
            req.rider.id,
            req.body,
        );
        res.status(200).json({ success: true, data: assignment });
    }

    async resetToWarehouse(req: Request<{ orderId: string }>, res: Response, _next: NextFunction): Promise<void> {
        const order = await this.deliveryService.backToWarehouse(Number(req.params.orderId));
        res.status(200).json({ success: true, data: order });
    }
}
