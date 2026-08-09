import { Request, Response } from "express";
import { DeliveryAdminService } from "../service/delivery.admin.service";
import { CreateRiderType } from "../utils/zod_validations/delivery.zod";
import { ImageDeletionService } from "../service/image.delete.service";

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

    //  ALL ORDERS (AT_WAREHOUSE)

    async getAtWarehouseOrders(req: Request, res: Response) {
        const page = Number(req.query.page as string) || 1;
        const limit = Number(req.query.limit as string) || 20;
        const search = (req.query.search as string) || undefined;
        const sort = (req.query.sort as "newest" | "oldest") || "newest";
        // Accept comma-separated statuses, e.g. ?statuses=ARRIVED_AT_WAREHOUSE,DELAYED
        const statusesParam = req.query.statuses as string | undefined;
        const statuses = statusesParam
            ? (statusesParam.split(",").map((s) => s.trim()) as any[])
            : undefined;

        const result = await this.deliveryAdminService.getAtWarehouseOrders(
            page,
            limit,
            search,
            sort,
            statuses,
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

    async bulkAssignRider(req: Request, res: Response) {
        const { orderIds, riderId } = req.body;

        const results = await this.deliveryAdminService.bulkAssignRider(
            orderIds,
            riderId,
        );

        res.status(200).json({
            success: true,
            data: results,
        });
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

    async getFailedDeliveries(req: Request, res: Response) {
        const data = await this.deliveryAdminService.getFailedDeliveries();
        res.json({ success: true, data });
    }
}
