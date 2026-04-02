import { Repository } from "typeorm";
import { DeliveryStatus, Order, OrderStatus } from "../entities/order.entity";
import { Rider } from "../entities/rider.entity";
import {
    AssignmentStatus,
    DeliveryAssignment,
} from "../entities/deliveryAssignment.entity";
import AppDataSource from "../config/db.config";
import { APIError } from "../utils/ApiError.utils";
import {
    AssignRiderType,
    CreateRiderType,
    DeliveryFailedType,
} from "../utils/zod_validations/delivery.zod";
import { OrderItem } from "../entities/orderItems.entity";
import bcrypt from "bcryptjs";
import { User, UserRole } from "../entities/user.entity";

export class DeliveryService {
    private orderRepository: Repository<Order>;
    private riderRepository: Repository<Rider>;
    private assignmentRepository: Repository<DeliveryAssignment>;
    private orderItemRepository: Repository<OrderItem>;
    private userRepository: Repository<User>;

    // to verify status change
    private readonly ALLOWED_STATUS_TRANSITIONS: Record<
        DeliveryStatus,
        DeliveryStatus[]
    > = {
        [DeliveryStatus.ORDER_PROCESSING]: [DeliveryStatus.AT_WAREHOUSE],
        [DeliveryStatus.READY_FOR_DELIVERY]: [DeliveryStatus.RIDER_ASSIGNED],
        [DeliveryStatus.AT_WAREHOUSE]: [DeliveryStatus.RIDER_ASSIGNED],
        [DeliveryStatus.RIDER_ASSIGNED]: [DeliveryStatus.OUT_FOR_DELIVERY],
        [DeliveryStatus.OUT_FOR_DELIVERY]: [
            DeliveryStatus.DELIVERED,
            DeliveryStatus.DELIVERY_FAILED,
        ],
        [DeliveryStatus.DELIVERY_FAILED]: [DeliveryStatus.AT_WAREHOUSE],
        [DeliveryStatus.DELIVERED]: [],
        [DeliveryStatus.RETURNED_WAREHOUSE]: [DeliveryStatus.AT_WAREHOUSE],
    };

    constructor() {
        this.orderRepository = AppDataSource.getRepository(Order);
        this.riderRepository = AppDataSource.getRepository(Rider);
        this.assignmentRepository =
            AppDataSource.getRepository(DeliveryAssignment);
        this.orderItemRepository = AppDataSource.getRepository(OrderItem);
        this.userRepository = AppDataSource.getRepository(User);
    }

    private validateAndTransition(order: Order, target: DeliveryStatus): void {
        const allowed = this.ALLOWED_STATUS_TRANSITIONS[order.deliveryStatus];
        if (!allowed?.includes(target)) {
            throw new APIError(
                400,
                `Invalid status transition: '${order.deliveryStatus}' to '${target}'`,
            );
        }
        order.deliveryStatus = target;
    }

    async findOrderById(orderId: number): Promise<Order> {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: ["shippingAddress", "orderItems", "orderedBy"],
        });

        if (!order) {
            throw new APIError(404, "order not found");
        }

        return order;
    }

    //  RIDER MANAGEMENT

    async createRider(data: CreateRiderType) {
        const existing = await this.riderRepository.findOne({
            where: { email: data.email },
        });

        if (existing) {
            throw new APIError(409, "rider with this email already exists");
        }

        const hashedPassword = await bcrypt.hash(data.password, 10);

        return await AppDataSource.transaction(async (manager) => {
            const user = manager.create(User, {
                fullName: data.fullName,
                email: data.email,
                password: hashedPassword,
                phoneNumber: data.phoneNumber,
                role: UserRole.RIDER,
                isVerified: true,
            });

            const savedUser = await manager.save(user);

            const rider = manager.create(Rider, {
                fullName: data.fullName,
                userId: savedUser.id,
                phoneNumber: data.phoneNumber,
                email: data.email,
            });
            return await manager.save(rider);
        });
    }

    async getAllRiders() {
        return await this.riderRepository.find({
            order: { createdAt: "DESC" },
        });
    }

    async getRiderById(riderId: number) {
        const rider = await this.riderRepository.findOne({
            where: { id: riderId },
            relations: ["assignments"],
        });
        if (!rider) throw new APIError(404, "rider not found");
        return rider;
    }

    async resetRiderPassword(riderId: number, newPassword: string) {
        const rider = await this.riderRepository.findOne({
            where: { id: riderId },
        });

        if (!rider) {
            throw new APIError(404, "Rider not found");
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const result = await this.userRepository.update(
            { id: rider.userId },
            { password: hashedPassword },
        );

        if (result.affected === 0) {
            throw new APIError(
                404,
                "User connected to rider this rider ID not found",
            );
        }

        return { message: "Password reset successfull" };
    }

    //  ORDER PROCESSING

    async getProcessingOrders() {
        const orders = await this.orderRepository.find({
            where: { deliveryStatus: DeliveryStatus.ORDER_PROCESSING },
        });

        return orders;
    }

    async getProcessingOrderById(orderId: number) {
        const order = await this.orderRepository.findOne({
            where: { id: orderId },
            relations: [
                "orderItems",
                "orderItems.product",
                "orderItems.variant",
                "orderItems.vendor",
            ],
        });

        if (!order) {
            throw new APIError(404, "Order not found");
        }

        // if (order.deliveryStatus !== DeliveryStatus.ORDER_PROCESSING) {
        //     throw new APIError(
        //         400,
        //         `Order is processed and is ${order.deliveryStatus}`,
        //     );
        // }

        return order;
    }

    async markAtWarehouse(orderId: number) {
        const order = await this.findOrderById(orderId);

        this.validateAndTransition(order, DeliveryStatus.AT_WAREHOUSE);
        await this.orderRepository.save(order);

        return order;
    }

    async collectOrderItems(orderItemId: number) {
        const orderItem = await this.orderItemRepository.findOne({
            where: { id: orderItemId },
        });

        if (!orderItem) {
            throw new APIError(404, "Order Item not found");
        }

        orderItem.collectedAtWarehouse = true;
        await this.orderItemRepository.save(orderItem);

        const allOrderItems = await this.orderItemRepository.find({
            where: { orderId: orderItem.orderId },
            select: ["collectedAtWarehouse"],
        });

        const ready = allOrderItems.every(item => item.collectedAtWarehouse);

        if (ready) {
            const order = await this.orderRepository.findOne({
                where: { id: orderItem.orderId },
            });

            if (!order) {
                throw new APIError(404, "Order not found for this order item");
            }

            this.validateAndTransition(order, DeliveryStatus.READY_FOR_DELIVERY);
            await this.orderRepository.save(order);
        }
    }

    async getWarehouseOrderQueue(page: number = 1, limit: number = 20) {
        const [orders, total] = await this.orderRepository.findAndCount({
            where: { deliveryStatus: DeliveryStatus.READY_FOR_DELIVERY },
            relations: [
                "orderedBy",
                "shippingAddress",
                "orderItems",
                "orderItems.product",
                "orderItems.vendor",
            ],
            order: { updatedAt: "ASC" },
            skip: (page - 1) * limit,
            take: limit,
        });

        const totalPages = Math.ceil(total / limit);

        return {
            orders,
            total,
            pagination: {
                currentPage: page,
                totalPages,
            },
        };
    }

    //  ASSIGNMENTS

    async assignRider(orderId: number, data: AssignRiderType) {
        const order = await this.findOrderById(orderId);

        const rider = await this.riderRepository.findOne({
            where: { id: data.riderId },
        });
        if (!rider) throw new APIError(404, "rider not found");

        if (
            order.deliveryStatus !== DeliveryStatus.READY_FOR_DELIVERY &&
            order.deliveryStatus !== DeliveryStatus.AT_WAREHOUSE
        ) {
            throw new APIError(
                400,
                "Order is not ready for delivery assignment",
            );
        }

        const existingAssignment = await this.assignmentRepository.findOne({
            where: { orderId },
            order: { createdAt: "DESC" },
        });

        if (
            existingAssignment &&
            ![AssignmentStatus.DELIVERED, AssignmentStatus.FAILED].includes(
                existingAssignment.assignmentStatus,
            )
        ) {
            throw new APIError(
                400,
                "Order already has an active rider assigned",
            );
        }

        return await AppDataSource.transaction(async (manager) => {
            const assignment = manager.create(DeliveryAssignment, {
                orderId,
                riderId: data.riderId,
            });

            const savedAssignment = await manager.save(assignment);

            this.validateAndTransition(order, DeliveryStatus.RIDER_ASSIGNED);
            await manager.save(order);

            return savedAssignment;
        });
    }

    async getAllAssignments(page: number = 1, limit: number = 20) {
        const [assignments, total] =
            await this.assignmentRepository.findAndCount({
                relations: ["order", "rider"],
                order: { createdAt: "DESC" },
                skip: (page - 1) * limit,
                take: limit,
            });

        const totalPages = Math.ceil(total / limit);

        return {
            assignments,
            total,
            pagination: {
                currentPage: page,
                totalPages,
            },
        };
    }

    async getRiderAssignments(riderId: number) {
        return await this.assignmentRepository.find({
            where: { riderId },
            relations: ["order", "order.shippingAddress", "order.orderedBy"],
            order: { createdAt: "DESC" },
        });
    }

    async findOrderAssignment(orderId: number) {
        const assignment = await this.assignmentRepository.findOne({
            where: { orderId },
            order: { createdAt: "DESC" },
            relations: [
                "rider",
                "order",
                "order.shippingAddress",
                "order.orderItems",
                "order.orderedBy",
            ],
        });

        if (!assignment) {
            throw new APIError(
                404,
                "no active assignment for this order found",
            );
        }

        return assignment;
    }

    //  RIDER ACTIONS

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
            this.validateAndTransition(order, DeliveryStatus.OUT_FOR_DELIVERY);
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
            this.validateAndTransition(order, DeliveryStatus.DELIVERED);
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
            this.validateAndTransition(order, DeliveryStatus.DELIVERY_FAILED);
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

    async backToWarehouse(orderId: number) {
        const order = await this.findOrderById(orderId);

        this.validateAndTransition(order, DeliveryStatus.AT_WAREHOUSE);
        order.status = OrderStatus.RETURNED;
        await this.orderRepository.save(order);

        return order;
    }
}
