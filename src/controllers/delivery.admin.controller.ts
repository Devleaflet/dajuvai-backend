import { Request, Response } from "express";
import { DeliveryAdminService } from "../service/delivery.admin.service";
import { APIError } from "../utils/ApiError.utils";
import { CreateRiderType } from "../utils/zod_validations/delivery.zod";
import { ImageDeletionResult, ImageDeletionService } from "../service/image.delete.service";

export class DeliveryAdminController {
    private deliveryAdminService: DeliveryAdminService;
    private imageDeletionService: ImageDeletionService;

    constructor() {
        this.deliveryAdminService = new DeliveryAdminService();
        this.imageDeletionService = new ImageDeletionService();
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
            
            const rider = await this.deliveryAdminService.createRider(req.body);

            res.status(201).json({
                success: true,
                data: rider,
            });
        } catch (error) {

            if (req.body.documentUrl) {
                await this.imageDeletionService.deleteSingleImage(req.body.documentUrl);
            }

            this.handleError(res, error);
        }
    }

    async getAllRiders(req: Request, res: Response) {
        try {
            const riders = await this.deliveryAdminService.getAllRiders();
            res.status(200).json({ success: true, data: riders });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async getRiderById(req: Request<{ riderId: string }>, res: Response) {
        try {
            const riderId = Number(req.params.riderId);

            const rider = await this.deliveryAdminService.getRiderById(riderId);
            res.status(200).json({ success: true, data: rider });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async resetRiderPassword(req: Request<{ riderId: string }>, res: Response) {
        try {
            const riderId = Number(req.params.riderId);

            const { message } =
                await this.deliveryAdminService.resetRiderPassword(
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
            const orders =
                await this.deliveryAdminService.getProcessingOrders();

            return res.status(200).json({ success: true, data: orders });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async getProcessingOrderById(
        req: Request<{ orderId: string }>,
        res: Response,
    ) {
        try {
            const orderId = Number(req.params.orderId);

            const order =
                await this.deliveryAdminService.getProcessingOrderById(orderId);

            return res.status(200).json({ success: true, data: order });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async markAtWarehouse(req: Request<{ orderId: string }>, res: Response) {
        try {
            const orderId = Number(req.params.orderId);

            const order =
                await this.deliveryAdminService.markAtWarehouse(orderId);
            res.status(200).json({ success: true, data: order });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async collectOrderItems(
        req: Request<{ orderItemId: string }>,
        res: Response,
    ) {
        try {
            const orderItemId = Number(req.params.orderItemId);

            const orderItem =
                await this.deliveryAdminService.collectOrderItems(orderItemId);

            res.status(201).json({
                success: true,
                data: orderItem,
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

            const result =
                await this.deliveryAdminService.getWarehouseOrderQueue(
                    page,
                    limit,
                );
            res.status(200).json({
                success: true,
                data: result.orders,
                pagination: result.pagination,
            });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    //  ASSIGNMENTS

    async assignRider(req: Request<{ orderId: string }>, res: Response) {
        try {
            const orderId = Number(req.params.orderId);

            const assignment = await this.deliveryAdminService.assignRider(
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

            const result = await this.deliveryAdminService.getAllAssignments(
                page,
                limit,
            );
            res.status(200).json({ success: true, ...result });
        } catch (error) {
            this.handleError(res, error);
        }
    }

    async findOrderAssignment(
        req: Request<{ orderId: string }>,
        res: Response,
    ) {
        try {
            const orderId = Number(req.params.orderId);

            const assignments =
                await this.deliveryAdminService.findOrderAssignment(orderId);

            return res.status(200).json({ success: true, data: assignments });
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

            const order =
                await this.deliveryAdminService.backToWarehouse(orderId);
            res.status(200).json({ success: true, data: order });
        } catch (error) {
            this.handleError(res, error);
        }
    }
}
