import { Brackets, ILike, Repository } from "typeorm";
import { Order, OrderStatus } from "../entities/order.entity";
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
} from "../utils/zod_validations/delivery.zod";
import bcrypt from "bcryptjs";
import { User, UserRole } from "../entities/user.entity";
import {
    sanitizeAssignmentForDelivery,
    sanitizeOrderForDelivery,
    sanitizeRiderForDelivery,
} from "../utils/deliveryResponseSanitizer.utils";
import { OrderService } from "./order.service";

export class DeliveryAdminService {
    private orderRepository: Repository<Order>;
    private riderRepository: Repository<Rider>;
    private assignmentRepository: Repository<DeliveryAssignment>;
    private userRepository: Repository<User>;
    private orderService: OrderService;

    constructor() {
        this.orderRepository = AppDataSource.getRepository(Order);
        this.riderRepository = AppDataSource.getRepository(Rider);
        this.assignmentRepository =
            AppDataSource.getRepository(DeliveryAssignment);
        this.userRepository = AppDataSource.getRepository(User);
        this.orderService = new OrderService();
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
                documentUrl: data.documentUrl,
            });
            const saved = await manager.save(rider);
            return sanitizeRiderForDelivery(saved);
        });
    }

    async getAllRiders() {
        const riders = await this.riderRepository.find({
            order: { createdAt: "DESC" },
        });
        return riders.map((r) => sanitizeRiderForDelivery(r));
    }

    async getRiderById(riderId: number) {
        const rider = await this.riderRepository.findOne({
            where: { id: riderId },
            relations: ["assignments"],
        });
        if (!rider) throw new APIError(404, "rider not found");
        return {
            ...sanitizeRiderForDelivery(rider),
            assignments: (rider as any).assignments ?? [],
        };
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

    //  ALL ORDERS (AT_WAREHOUSE)

    /**
     * Returns paginated orders filtered by one or more statuses.
     * When no statuses are provided, defaults to ARRIVED_AT_WAREHOUSE.
     * Supports search by order number, customer name, or vendor name.
     * Supports sort by createdAt asc/desc.
     */
    async getAtWarehouseOrders(
        page: number = 1,
        limit: number = 20,
        search?: string,
        sort: "newest" | "oldest" = "newest",
        statuses?: OrderStatus[],
    ) {
        const filterStatuses =
            statuses && statuses.length > 0
                ? statuses
                : [OrderStatus.ARRIVED_AT_WAREHOUSE];

        const qb = this.orderRepository
            .createQueryBuilder("order")
            .leftJoinAndSelect("order.orderedBy", "orderedBy")
            .leftJoinAndSelect("order.shippingAddress", "shippingAddress")
            .leftJoinAndSelect("order.orderItems", "orderItems")
            .leftJoinAndSelect("orderItems.product", "product")
            .leftJoinAndSelect("orderItems.vendor", "vendor")
            .leftJoinAndSelect("orderItems.variant", "variant")
            // latest delivery assignment (for assigned rider info)
            .leftJoinAndSelect("order.deliveryAssignments", "latestAssignment")
            .leftJoinAndSelect("latestAssignment.rider", "rider")
            .where("order.status IN (:...filterStatuses)", { filterStatuses })
            .withDeleted();

        if (search && search.trim()) {
            const term = `%${search.trim()}%`;
            qb.andWhere(
                new Brackets((qb2) => {
                    qb2.where("order.orderNumber ILIKE :term", { term })
                        .orWhere("orderedBy.username ILIKE :term", { term })
                        .orWhere("orderedBy.fullName ILIKE :term", { term })
                        .orWhere("vendor.businessName ILIKE :term", { term });
                }),
            );
        }

        qb.orderBy("order.createdAt", sort === "oldest" ? "ASC" : "DESC")
          .addOrderBy("order.id", sort === "oldest" ? "ASC" : "DESC");

        const [orders, total] = await qb
            .skip((page - 1) * limit)
            .take(limit)
            .getManyAndCount();

        const totalPages = Math.ceil(total / limit);

        return {
            orders: orders.map((o) => sanitizeOrderForDelivery(o)),
            pagination: {
                total,
                currentPage: page,
                totalPages,
            },
        };
    }

    //  ASSIGNMENTS

    async assignRider(orderId: number, data: AssignRiderType) {
        const order = await this.findOrderById(orderId);

        const newRider = await this.riderRepository.findOne({
            where: { id: data.riderId },
        });
        if (!newRider) throw new APIError(404, "rider not found");

        // Order must be ARRIVED_AT_WAREHOUSE to be assigned
        if (order.status !== OrderStatus.ARRIVED_AT_WAREHOUSE) {
            throw new APIError(
                400,
                `Order status must be ARRIVED_AT_WAREHOUSE to assign a rider. Current status: ${order.status}`,
            );
        }

        const existingAssignment = await this.assignmentRepository.findOne({
            where: { orderId },
            order: { createdAt: "DESC" },
            relations: ["rider"],
        });

        const savedAssignment = await AppDataSource.transaction(
            async (manager) => {
                // If there's an existing assignment that is still active (not DELIVERED),
                // close it out and free the previous rider.
                if (
                    existingAssignment &&
                    ![
                        AssignmentStatus.DELIVERED,
                        AssignmentStatus.REASSIGNED
                    ].includes(existingAssignment.assignmentStatus)
                ) {
                    existingAssignment.assignmentStatus =
                        AssignmentStatus.REASSIGNED;
                    // existingAssignment.failureReason = `Reassigned to rider ${newRider.fullName || `#${newRider.id}`}`;
                    await manager.save(existingAssignment);

                    if (existingAssignment.rider) {
                        existingAssignment.rider.onDelivery = false;
                        await manager.save(existingAssignment.rider);
                    }
                }

                // Create new assignment for the new rider
                const assignment = manager.create(DeliveryAssignment, {
                    orderId,
                    riderId: data.riderId,
                    assignmentStatus: AssignmentStatus.ASSIGNED,
                });

                const saved = await manager.save(assignment);

                // Update new rider status
                newRider.onDelivery = true;
                await manager.save(newRider);

                return saved;
            },
        );

        await this.orderService.changeOrderStatus(
            orderId,
            OrderStatus.ASSIGNED_TO_RIDER,
            {
                actorRole: "SYSTEM",
                reason: `Assigned to rider ${newRider.fullName || `#${newRider.id}`}`,
            },
        );

        return savedAssignment;
    }

    /**
     * Bulk assign a single rider to multiple orders.
     * Returns per-order results so the UI can show which orders failed.
     */
    async bulkAssignRider(
        orderIds: number[],
        riderId: number,
    ): Promise<{ orderId: number; success: boolean; error?: string }[]> {
        const rider = await this.riderRepository.findOne({
            where: { id: riderId },
        });
        if (!rider) throw new APIError(404, "rider not found");

        const results: { orderId: number; success: boolean; error?: string }[] =
            [];

        for (const orderId of orderIds) {
            try {
                await this.assignRider(orderId, { riderId });
                results.push({ orderId, success: true });
            } catch (err: any) {
                results.push({
                    orderId,
                    success: false,
                    error: err?.message ?? "Unknown error",
                });
            }
        }

        return results;
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
            data: assignments.map((a) => sanitizeAssignmentForDelivery(a)),
            pagination: {
                total,
                currentPage: page,
                totalPages,
            },
        };
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

        return sanitizeAssignmentForDelivery(assignment);
    }

    // reset status to ARRIVED_AT_WAREHOUSE from failed
    async backToWarehouse(orderId: number) {
        const order = await this.findOrderById(orderId);

        // Find existing active assignment (if any) and clear it so a new rider can be assigned
        const existingAssignment = await this.assignmentRepository.findOne({
            where: { orderId },
            order: { createdAt: "DESC" },
            relations: ["rider"],
        });

        if (
            existingAssignment &&
            existingAssignment.assignmentStatus !== AssignmentStatus.DELIVERED &&
            existingAssignment.assignmentStatus !== AssignmentStatus.NONE
        ) {
            await AppDataSource.transaction(async (manager) => {
                existingAssignment.assignmentStatus = AssignmentStatus.NONE;
                await manager.save(existingAssignment);

                if (existingAssignment.rider) {
                    existingAssignment.rider.onDelivery = false;
                    await manager.save(existingAssignment.rider);
                }
            });
        }

        if (order.status !== OrderStatus.ARRIVED_AT_WAREHOUSE) {
            await this.orderService.changeOrderStatus(
                orderId,
                OrderStatus.ARRIVED_AT_WAREHOUSE,
                {
                    actorRole: "SYSTEM",
                    reason: "Order reset to warehouse for reassignment",
                },
            );
        }

        // Reload order to return fresh data
        const updated = await this.findOrderById(orderId);
        return sanitizeOrderForDelivery(updated);
    }

    async getFailedDeliveries(): Promise<DeliveryAssignment[]> {
        return this.assignmentRepository
            .createQueryBuilder("assignment")
            .leftJoinAndSelect("assignment.order", "order")
            .leftJoinAndSelect("assignment.rider", "rider")
            .where("assignment.assignmentStatus = :status", {
                status: AssignmentStatus.FAILED,
            })
            .orderBy("assignment.updatedAt", "DESC")
            .getMany();
    }
}
