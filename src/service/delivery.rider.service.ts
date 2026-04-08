import { Repository } from "typeorm";
import { DeliveryStatus, Order, OrderStatus } from "../entities/order.entity";
import { Rider } from "../entities/rider.entity";
import {
    AssignmentStatus,
    DeliveryAssignment,
} from "../entities/deliveryAssignment.entity";
import AppDataSource from "../config/db.config";
import { APIError } from "../utils/ApiError.utils";
import { DeliveryFailedType } from "../utils/zod_validations/delivery.zod";
import { DeliveryAdminService } from "./delivery.admin.service";
import { sanitizeAssignmentForDelivery } from "../utils/deliveryResponseSanitizer.utils";

export class DeliveryRiderService {
    private orderRepository: Repository<Order>;
    private assignmentRepository: Repository<DeliveryAssignment>;
    private adminService: DeliveryAdminService;

    constructor() {
        this.orderRepository = AppDataSource.getRepository(Order);
        this.assignmentRepository =
            AppDataSource.getRepository(DeliveryAssignment);
        this.adminService = new DeliveryAdminService();
    }

    async getRiderAssignments(riderId: number) {
        const assignments = await this.assignmentRepository.find({
            where: { riderId },
            relations: ["order", "order.shippingAddress", "order.orderedBy"],
            order: { createdAt: "DESC" },
        });

        return assignments.map((a) => sanitizeAssignmentForDelivery(a));
    }

    async confirmPickup(orderId: number, riderId: number) {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
        });

        if (!order) throw new APIError(404, "order not found");

        const assignment = await this.assignmentRepository.findOne({
            where: {
                orderId,
                riderId,
            },
            order: { createdAt: "DESC" },
        });

        if (!assignment) {
            throw new APIError(404, "this rider is not assigned to this order");
        }

        if (assignment.assignmentStatus !== AssignmentStatus.ASSIGNED) {
            throw new APIError(
                400,
                `Delivery assignment is currently ${assignment.assignmentStatus}`,
            );
        }

        return await AppDataSource.transaction(async (manager) => {
            this.adminService.validateAndTransition(order, DeliveryStatus.OUT_FOR_DELIVERY);
            order.status = OrderStatus.SHIPPED;
            await manager.save(order);

            assignment.assignmentStatus = AssignmentStatus.PICKED_UP;
            assignment.pickedUpAt = new Date();
            await manager.save(assignment);

            const rider = await manager.findOne(Rider, { where: { id: riderId } });
            if (rider) {
                rider.onDelivery = true;
                await manager.save(rider);
            }

            return assignment;
        });
    }

    async markDelivered(orderId: number, riderId: number) {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
        });
        if (!order) throw new APIError(404, "Order not found");

        const assignment = await this.assignmentRepository.findOne({
            where: {
                orderId,
                riderId,
                assignmentStatus: AssignmentStatus.PICKED_UP,
            },
            order: { createdAt: "DESC" },
        });
        if (!assignment) {
            throw new APIError(
                404,
                "this rider was not assigned to this order or was not picked up",
            );
        }

        return await AppDataSource.transaction(async (manager) => {
            this.adminService.validateAndTransition(order, DeliveryStatus.DELIVERED);
            order.status = OrderStatus.DELIVERED;
            await manager.save(order);

            assignment.assignmentStatus = AssignmentStatus.DELIVERED;
            assignment.deliveredAt = new Date();
            await manager.save(assignment);

            const rider = await manager.findOne(Rider, { where: { id: riderId } });
            if (rider) {
                rider.onDelivery = false;
                await manager.save(rider);
            }

            return assignment;
        });
    }

    async markDeliveryFailed(
        orderId: number,
        riderId: number,
        data: DeliveryFailedType,
    ) {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
        });
        if (!order) throw new APIError(404, "Order not found");

        const assignment = await this.assignmentRepository.findOne({
            where: {
                orderId,
                riderId,
                assignmentStatus: AssignmentStatus.PICKED_UP,
            },
            order: { createdAt: "DESC" },
        });
        if (!assignment) {
            throw new APIError(
                404,
                "no active pickup found for this rider and order",
            );
        }

        return await AppDataSource.transaction(async (manager) => {
            this.adminService.validateAndTransition(order, DeliveryStatus.DELIVERY_FAILED);
            await manager.save(order);

            assignment.assignmentStatus = AssignmentStatus.FAILED;
            assignment.failureReason = data.failedReason;
            await manager.save(assignment);

            const rider = await manager.findOne(Rider, { where: { id: riderId } });
            if (rider) {
                rider.onDelivery = false;
                await manager.save(rider);
            }

            return assignment;
        });
    }
}
