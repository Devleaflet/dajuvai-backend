import { Response } from "express";
import { AuthRequest } from "../middlewares/auth.middleware";
import { AuditActorType } from "../entities/auditLog.entity";
import { UserRole } from "../entities/user.entity";
import { DeliveryAdminService } from "../service/delivery.admin.service";
import {
    CreateRiderType,
    DeliveryAssignmentsQuery,
    DeliveryOrdersQuery,
    FailedDeliveriesQuery,
} from "../utils/zod_validations/delivery.zod";
import { CloudinaryService } from "../service/image.service";

export class DeliveryAdminController {
    private deliveryAdminService: DeliveryAdminService;
    private cloudinaryService: CloudinaryService;

    constructor() {
        this.deliveryAdminService = new DeliveryAdminService();
        this.cloudinaryService = new CloudinaryService();
    }

    //  RIDER MANAGEMENT

    async createRider(req: AuthRequest<{}, {}, CreateRiderType>, res: Response) {
        try {
            const rider = await this.deliveryAdminService.createRider(req.body);

            res.status(201).json({
                success: true,
                data: rider,
            });
        } catch (error) {
            if (req.body.documentUrl) {
                try {
                    await this.cloudinaryService.deleteByUrl(
                        req.body.documentUrl,
                    );
                } catch (cleanupErr) {
                    console.error("[ DELIVERY ] document cleanup failed:", cleanupErr);
                }
            }

            throw error;
        }
    }

    async getAllRiders(_req: AuthRequest<any, any, any, any>, res: Response) {
        const riders = await this.deliveryAdminService.getAllRiders();
        res.status(200).json({ success: true, data: riders });
    }

    async getRiderById(req: AuthRequest<{ riderId: string }, any, any, any>, res: Response) {
        const riderId = Number(req.params.riderId);

        const rider = await this.deliveryAdminService.getRiderById(riderId);
        res.status(200).json({ success: true, data: rider });
    }

    async resetRiderPassword(req: AuthRequest<{ riderId: string }, any, any, any>, res: Response) {
        const riderId = Number(req.params.riderId);

        const { message } = await this.deliveryAdminService.resetRiderPassword(
            riderId,
            req.body.newPassword,
        );

        res.status(200).json({ success: true, message });
    }

    //  ALL ORDERS (AT_WAREHOUSE)

    // The query was parsed and defaulted by `validateZod(…, "query")`.
    async getAtWarehouseOrders(req: AuthRequest<any, any, any, any>, res: Response) {
        const result = await this.deliveryAdminService.getAtWarehouseOrders(
            req.query as DeliveryOrdersQuery,
        );

        res.status(200).json({
            success: true,
            data: result.orders,
            pagination: result.pagination,
        });
    }

    //  ASSIGNMENTS

    async assignRider(req: AuthRequest<{ orderId: string }, any, any, any>, res: Response) {
        const orderId = Number(req.params.orderId);

        const assignment = await this.deliveryAdminService.assignRider(
            orderId,
            req.body, req.user!.id, req.user!.role === UserRole.STAFF ? AuditActorType.STAFF : AuditActorType.ADMIN,
        );
        res.status(200).json({ success: true, data: assignment });
    }

    async bulkAssignRider(req: AuthRequest<any, any, any, any>, res: Response) {
        const { orderIds, riderId } = req.body;

        const results = await this.deliveryAdminService.bulkAssignRider(
            orderIds,
            riderId, req.user!.id, req.user!.role === UserRole.STAFF ? AuditActorType.STAFF : AuditActorType.ADMIN,
        );

        res.status(200).json({
            success: true,
            data: results,
        });
    }

    async getAllAssignments(req: AuthRequest<any, any, any, any>, res: Response) {
        const result = await this.deliveryAdminService.getAllAssignments(
            req.query as DeliveryAssignmentsQuery,
        );
        res.status(200).json({ success: true, ...result });
    }

    async findOrderAssignment(
        req: AuthRequest<{ orderId: string }, any, any, any>,
        res: Response,
    ) {
        const orderId = Number(req.params.orderId);

        const assignments = await this.deliveryAdminService.findOrderAssignment(
            orderId,
        );

        return res.status(200).json({ success: true, data: assignments });
    }

    async resetToWarehouse(
        req: AuthRequest<{ orderId: string }, any, any, any>,
        res: Response,
    ): Promise<void> {
        const orderId = Number(req.params.orderId);

        const order = await this.deliveryAdminService.backToWarehouse(orderId, req.user!.id, req.user!.role === UserRole.STAFF ? AuditActorType.STAFF : AuditActorType.ADMIN);
        res.status(200).json({ success: true, data: order });
    }

    async getFailedDeliveries(req: AuthRequest<any, any, any, any>, res: Response) {
        const result = await this.deliveryAdminService.getFailedDeliveries(
            req.query as FailedDeliveriesQuery,
        );
        res.json({ success: true, ...result });
    }
}
