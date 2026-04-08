import { Request, Response } from "express";
import { DeliveryAdminService } from "../service/delivery.admin.service";
import { CreateRiderType } from "../utils/zod_validations/delivery.zod";
import { ImageDeletionResult, ImageDeletionService } from "../service/image.delete.service";

export class DeliveryAdminController {
    private deliveryAdminService: DeliveryAdminService;
    private imageDeletionService: ImageDeletionService;

    constructor() {
        this.deliveryAdminService = new DeliveryAdminService();
        this.imageDeletionService = new ImageDeletionService();
    }

    //  RIDER MANAGEMENT

    async createRider(req: Request<{}, {}, CreateRiderType>, res: Response) {
        try {
            const rider = await this.deliveryAdminService.createRider(req.body);

            res.status(201).json({
                success: true,
                data: rider,
            });
        } catch (error) {
            // Cleanup uploaded doc on failure, then forward the real error to the global handler.
            if (req.body.documentUrl) {
                try {
                    await this.imageDeletionService.deleteSingleImage(
                        req.body.documentUrl,
                    );
                } catch (cleanupErr) {
                    console.error("[ DELIVERY ] document cleanup failed:", cleanupErr);
                }
            }

            throw error;
        }
    }

    async getAllRiders(req: Request, res: Response) {
        const riders = await this.deliveryAdminService.getAllRiders();
        res.status(200).json({ success: true, data: riders });
    }

    async getRiderById(req: Request<{ riderId: string }>, res: Response) {
        const riderId = Number(req.params.riderId);

        const rider = await this.deliveryAdminService.getRiderById(riderId);
        res.status(200).json({ success: true, data: rider });
    }

    async resetRiderPassword(req: Request<{ riderId: string }>, res: Response) {
        const riderId = Number(req.params.riderId);

        const { message } = await this.deliveryAdminService.resetRiderPassword(
            riderId,
            req.body.newPassword,
        );

        res.status(200).json({ success: true, message });
    }

    //  ORDER PROCESSING

    async getProcessingOrders(req: Request, res: Response) {
        const orders = await this.deliveryAdminService.getProcessingOrders();

        return res.status(200).json({ success: true, data: orders });
    }

    async getProcessingOrderById(
        req: Request<{ orderId: string }>,
        res: Response,
    ) {
        const orderId = Number(req.params.orderId);

        const order = await this.deliveryAdminService.getProcessingOrderById(
            orderId,
        );

        return res.status(200).json({ success: true, data: order });
    }

    async markAtWarehouse(req: Request<{ orderId: string }>, res: Response) {
        const orderId = Number(req.params.orderId);

        const order = await this.deliveryAdminService.markAtWarehouse(orderId);
        res.status(200).json({ success: true, data: order });
    }

    async collectOrderItems(
        req: Request<{ orderItemId: string }>,
        res: Response,
    ) {
        const orderItemId = Number(req.params.orderItemId);

        const orderItem = await this.deliveryAdminService.collectOrderItems(
            orderItemId,
        );

        res.status(201).json({
            success: true,
            data: orderItem,
            message: "Order Item Collected",
        });
    }

    async getWarehouseOrderQueue(req: Request, res: Response) {
        const page = Number(req.query.page as string) || 1;
        const limit = Number(req.query.limit as string) || 20;

        const result = await this.deliveryAdminService.getWarehouseOrderQueue(
            page,
            limit,
        );
        res.status(200).json({
            success: true,
            data: result.orders,
            pagination: result.pagination,
        });
    }

    //  ASSIGNMENTS

    async assignRider(req: Request<{ orderId: string }>, res: Response) {
        const orderId = Number(req.params.orderId);

        const assignment = await this.deliveryAdminService.assignRider(
            orderId,
            req.body,
        );
        res.status(200).json({ success: true, data: assignment });
    }

    async getAllAssignments(req: Request, res: Response) {
        const page = Number(req.query.page as string) || 1;
        const limit = Number(req.query.limit as string) || 20;

        const result = await this.deliveryAdminService.getAllAssignments(
            page,
            limit,
        );
        res.status(200).json({ success: true, ...result });
    }

    async findOrderAssignment(
        req: Request<{ orderId: string }>,
        res: Response,
    ) {
        const orderId = Number(req.params.orderId);

        const assignments = await this.deliveryAdminService.findOrderAssignment(
            orderId,
        );

        return res.status(200).json({ success: true, data: assignments });
    }

    async resetToWarehouse(
        req: Request<{ orderId: string }>,
        res: Response,
    ): Promise<void> {
        const orderId = Number(req.params.orderId);

        const order = await this.deliveryAdminService.backToWarehouse(orderId);
        res.status(200).json({ success: true, data: order });
    }
}
