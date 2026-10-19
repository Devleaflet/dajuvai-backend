import { Brackets, In, Repository } from "typeorm";
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
    DeliveryAssignmentsQuery,
    DeliveryOrdersQuery,
    FailedDeliveriesQuery,
} from "../utils/zod_validations/delivery.zod";
import { ACTIVE_ASSIGNMENT_STATUSES, syncRiderAvailability } from "../utils/riderAvailability.utils";
import bcrypt from "bcryptjs";
import { User, UserRole } from "../entities/user.entity";
import {
    sanitizeAssignmentForDelivery,
    sanitizeOrderForDelivery,
    sanitizeRiderForDelivery,
} from "../utils/deliveryResponseSanitizer.utils";
import { OrderService } from "./order.service";
import { AuditActorType } from "../entities/auditLog.entity";

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

    /**
     * Every rider with what they are carrying now and what they have delivered.
     *
     * `onDelivery` is answered from the open assignments rather than the stored
     * flag, so the list is right even for a row the flag got wrong in the past.
     */
    async getAllRiders() {
        const riders = await this.riderRepository
            .createQueryBuilder("rider")
            .loadRelationCountAndMap("rider.activeDeliveries", "rider.assignments", "active", (qb) =>
                qb
                    .where("active.assignmentStatus IN (:...activeStatuses)", {
                        activeStatuses: ACTIVE_ASSIGNMENT_STATUSES,
                    })
                    // An open assignment on an order that has since left the
                    // rider (cancelled from the orders page by older code) is
                    // not something they are carrying.
                    .andWhere(
                        `EXISTS (SELECT 1 FROM "orders" o WHERE o.id = active."orderId" AND o.status = :withRider)`,
                        { withRider: OrderStatus.ASSIGNED_TO_RIDER },
                    ),
            )
            .loadRelationCountAndMap("rider.completedDeliveries", "rider.assignments", "done", (qb) =>
                qb.where("done.assignmentStatus = :delivered", {
                    delivered: AssignmentStatus.DELIVERED,
                }),
            )
            .orderBy("rider.createdAt", "DESC")
            .addOrderBy("rider.id", "DESC")
            .getMany();

        return riders.map((rider) => withRiderLoad(rider));
    }

    async getRiderById(riderId: number) {
        const rider = await this.riderRepository.findOne({
            where: { id: riderId },
            // The order is loaded so a rider's history can name each delivery by
            // its order number. The order id alone is an internal handle and
            // means nothing to an administrator reading the list.
            relations: ["assignments", "assignments.order"],
            order: { assignments: { id: "DESC" } },
        });
        if (!rider) throw new APIError(404, "rider not found");

        const assignments: DeliveryAssignment[] = (rider as any).assignments ?? [];
        return {
            ...withRiderLoad(rider, {
                activeDeliveries: assignments.filter(
                    (a) =>
                        ACTIVE_ASSIGNMENT_STATUSES.includes(a.assignmentStatus) &&
                        a.order?.status === OrderStatus.ASSIGNED_TO_RIDER,
                ).length,
                completedDeliveries: assignments.filter(
                    (a) => a.assignmentStatus === AssignmentStatus.DELIVERED,
                ).length,
            }),
            // Only the two identifying fields of the order are exposed; the rest
            // of it is not this endpoint's to hand out.
            assignments: assignments.map((assignment: any) => ({
                ...assignment,
                order: assignment.order
                    ? {
                          id: assignment.order.id,
                          orderNumber: assignment.order.orderNumber ?? null,
                          status: assignment.order.status ?? null,
                      }
                    : null,
            })),
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
     * Paginated delivery orders.
     *
     * With no statuses this is the warehouse queue (ARRIVED_AT_WAREHOUSE).
     * Given statuses, it lists orders in any of them — but only orders that
     * actually reached delivery: a CANCELLED order cancelled at checkout never
     * saw the warehouse and does not belong in a delivery list.
     *
     * Two queries. The first filters and pages bare order ids — every filter is
     * an EXISTS, so no to-many join can multiply rows, truncate an order's line
     * items to the ones a vendor search matched, or force TypeORM's DISTINCT
     * pagination. The second loads the page's relations by id.
     */
    async getAtWarehouseOrders(query: DeliveryOrdersQuery) {
        const { page, limit, sort } = query;
        const filterStatuses =
            query.statuses && query.statuses.length > 0
                ? query.statuses
                : [OrderStatus.ARRIVED_AT_WAREHOUSE];
        const direction = sort === "oldest" ? "ASC" : "DESC";

        const idQuery = this.orderRepository
            .createQueryBuilder("order")
            .select(["order.id", "order.createdAt"])
            .where("order.status IN (:...filterStatuses)", { filterStatuses })
            .andWhere(
                new Brackets((reached) => {
                    reached
                        .where("order.status IN (:...inDelivery)", {
                            inDelivery: [
                                OrderStatus.ARRIVED_AT_WAREHOUSE,
                                OrderStatus.ASSIGNED_TO_RIDER,
                            ],
                        })
                        .orWhere(
                            `EXISTS (SELECT 1 FROM "delivery_assignments" da WHERE da."orderId" = "order"."id")`,
                        )
                        .orWhere(
                            `EXISTS (SELECT 1 FROM "order_status_histories" h WHERE h."orderId" = "order"."id" AND h."newStatus" = :warehouse)`,
                            { warehouse: OrderStatus.ARRIVED_AT_WAREHOUSE },
                        );
                }),
            )
            .withDeleted();

        if (query.paymentMethod) {
            idQuery.andWhere("order.paymentMethod = :paymentMethod", {
                paymentMethod: query.paymentMethod,
            });
        }

        if (query.riderId) {
            // The rider on the order's latest assignment — who has it now, or
            // had it last — not anyone who ever carried it.
            idQuery.andWhere(
                `EXISTS (
                    SELECT 1 FROM "delivery_assignments" da
                    WHERE da."orderId" = "order"."id" AND da."riderId" = :riderId
                      AND da."assignmentStatus" NOT IN (:...cleared)
                      AND NOT EXISTS (
                          SELECT 1 FROM "delivery_assignments" newer
                          WHERE newer."orderId" = da."orderId" AND newer.id > da.id
                      )
                )`,
                {
                    riderId: query.riderId,
                    cleared: [AssignmentStatus.NONE, AssignmentStatus.REASSIGNED],
                },
            );
        }

        if (query.search) {
            const term = likeTerm(query.search);
            const exactId = /^\d{1,9}$/.test(query.search) ? Number(query.search) : null;
            idQuery.andWhere(
                new Brackets((match) => {
                    match
                        .where(`"order"."orderNumber" ILIKE :term`, { term })
                        .orWhere(`"order"."phoneNumber" ILIKE :term`, { term })
                        .orWhere(
                            `EXISTS (
                                SELECT 1 FROM "user" u WHERE u.id = "order"."orderedById"
                                AND (u."fullName" ILIKE :term OR u."username" ILIKE :term
                                     OR u."email" ILIKE :term OR u."phoneNumber" ILIKE :term)
                            )`,
                            { term },
                        )
                        .orWhere(
                            `EXISTS (
                                SELECT 1 FROM "order_items" oi
                                JOIN "vendor" v ON v.id = oi."vendorId"
                                WHERE oi."orderId" = "order"."id" AND v."businessName" ILIKE :term
                            )`,
                            { term },
                        );
                    if (exactId !== null) match.orWhere("order.id = :exactId", { exactId });
                }),
            );
        }

        const [rows, total] = await idQuery
            .orderBy("order.createdAt", direction)
            .addOrderBy("order.id", direction)
            .offset((page - 1) * limit)
            .limit(limit)
            .getManyAndCount();

        const ids = rows.map((row) => row.id);
        const orders =
            ids.length === 0
                ? []
                : await this.orderRepository
                      .createQueryBuilder("order")
                      .leftJoinAndSelect("order.orderedBy", "orderedBy")
                      .leftJoinAndSelect("order.shippingAddress", "shippingAddress")
                      .leftJoinAndSelect("order.orderItems", "orderItems")
                      .leftJoinAndSelect("orderItems.product", "product")
                      .leftJoinAndSelect("orderItems.vendor", "vendor")
                      .leftJoinAndSelect("orderItems.variant", "variant")
                      // The sanitizer picks the latest of these for the rider column.
                      .leftJoinAndSelect("order.deliveryAssignments", "latestAssignment")
                      .leftJoinAndSelect("latestAssignment.rider", "rider")
                      .whereInIds(ids)
                      .withDeleted()
                      .getMany();

        // The second query has no ORDER BY of its own; the page keeps the first's.
        const position = new Map(ids.map((id, index) => [id, index]));
        orders.sort((a, b) => position.get(a.id)! - position.get(b.id)!);

        return {
            orders: orders.map((o) => sanitizeOrderForDelivery(o)),
            pagination: paginationOf(total, page, limit),
        };
    }

    //  ASSIGNMENTS

    async assignRider(orderId: number, data: AssignRiderType, changedByUserId: number, auditActorType: AuditActorType) {
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

        const savedAssignment = await AppDataSource.transaction(
            async (manager) => {
                // Close out any assignment still open on this order. A failed or
                // cleared one is left alone: it is already finished, and
                // overwriting it would erase the failure from the record.
                const open = await manager.find(DeliveryAssignment, {
                    where: { orderId, assignmentStatus: In(ACTIVE_ASSIGNMENT_STATUSES) },
                });
                for (const assignment of open) {
                    assignment.assignmentStatus = AssignmentStatus.REASSIGNED;
                    await manager.save(assignment);
                }

                const assignment = manager.create(DeliveryAssignment, {
                    orderId,
                    riderId: data.riderId,
                    assignmentStatus: AssignmentStatus.ASSIGNED,
                });
                const saved = await manager.save(assignment);

                await syncRiderAvailability(manager, [
                    data.riderId,
                    ...open.map((previous) => previous.riderId),
                ]);

                return saved;
            },
        );

        await this.orderService.changeOrderStatus(
            orderId,
            OrderStatus.ASSIGNED_TO_RIDER,
            {
                actorRole: "ADMIN",
                changedByUserId,
                auditActorType,
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
        changedByUserId: number,
        auditActorType: AuditActorType,
    ): Promise<{ orderId: number; success: boolean; error?: string }[]> {
        const rider = await this.riderRepository.findOne({
            where: { id: riderId },
        });
        if (!rider) throw new APIError(404, "rider not found");

        const results: { orderId: number; success: boolean; error?: string }[] =
            [];

        for (const orderId of orderIds) {
            try {
                await this.assignRider(orderId, { riderId }, changedByUserId, auditActorType);
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

    /** The delivery log, newest first, filtered and searched in the database. */
    async getAllAssignments(query: DeliveryAssignmentsQuery) {
        const { page, limit } = query;
        const direction = query.sort === "oldest" ? "ASC" : "DESC";

        const qb = this.assignmentRepository
            .createQueryBuilder("assignment")
            .leftJoinAndSelect("assignment.order", "order")
            .leftJoinAndSelect("order.orderedBy", "orderedBy")
            .leftJoinAndSelect("assignment.rider", "rider");

        if (query.status === "active") {
            qb.andWhere("assignment.assignmentStatus IN (:...active)", {
                active: ACTIVE_ASSIGNMENT_STATUSES,
            }).andWhere("order.status = :withRider", { withRider: OrderStatus.ASSIGNED_TO_RIDER });
        } else if (query.status) {
            qb.andWhere("assignment.assignmentStatus = :status", { status: query.status });
        }

        if (query.riderId) {
            qb.andWhere("assignment.riderId = :riderId", { riderId: query.riderId });
        }

        if (query.search) {
            const term = likeTerm(query.search);
            qb.andWhere(
                new Brackets((match) => {
                    match
                        .where("order.orderNumber ILIKE :term", { term })
                        .orWhere("rider.fullName ILIKE :term", { term })
                        .orWhere("rider.phoneNumber ILIKE :term", { term })
                        .orWhere("orderedBy.fullName ILIKE :term", { term })
                        .orWhere("orderedBy.username ILIKE :term", { term })
                        .orWhere("orderedBy.phoneNumber ILIKE :term", { term })
                        .orWhere("assignment.failureReason ILIKE :term", { term });
                }),
            );
        }

        // Every join here is many-to-one, so plain OFFSET/LIMIT pages rows
        // exactly, without TypeORM's DISTINCT pagination query.
        const [assignments, total] = await qb
            .orderBy("assignment.createdAt", direction)
            .addOrderBy("assignment.id", direction)
            .offset((page - 1) * limit)
            .limit(limit)
            .getManyAndCount();

        return {
            data: assignments.map((a) => sanitizeAssignmentForDelivery(a)),
            pagination: paginationOf(total, page, limit),
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

    /**
     * Takes an order back from its rider into the warehouse queue, ready for
     * another rider.
     *
     * Only from the states where that means something — with a rider, or
     * failed by one. From anywhere else (DELIVERED, CANCELLED…) it would quietly
     * un-deliver or revive an order; the orders page is where such a change
     * belongs, with its own reason.
     *
     * An open assignment is cleared. A failed one is kept as it is: it is the
     * record of what went wrong, and the failed list reads it.
     */
    async backToWarehouse(orderId: number, changedByUserId: number, auditActorType: AuditActorType) {
        const order = await this.findOrderById(orderId);

        if (!RECOVERABLE_STATUSES.includes(order.status)) {
            throw new APIError(
                400,
                `Only orders with a rider or a failed delivery can be sent back to the warehouse. Current status: ${order.status}`,
            );
        }

        await AppDataSource.transaction(async (manager) => {
            const open = await manager.find(DeliveryAssignment, {
                where: { orderId, assignmentStatus: In(ACTIVE_ASSIGNMENT_STATUSES) },
            });
            for (const assignment of open) {
                assignment.assignmentStatus = AssignmentStatus.NONE;
                await manager.save(assignment);
            }
            await syncRiderAvailability(manager, open.map((assignment) => assignment.riderId));
        });

        if (order.status !== OrderStatus.ARRIVED_AT_WAREHOUSE) {
            await this.orderService.changeOrderStatus(
                orderId,
                OrderStatus.ARRIVED_AT_WAREHOUSE,
                {
                    actorRole: "ADMIN",
                    changedByUserId,
                    auditActorType,
                    reason: "Order reset to warehouse for reassignment",
                },
            );
        }

        // Reload order to return fresh data
        const updated = await this.findOrderById(orderId);
        return sanitizeOrderForDelivery(updated);
    }

    /**
     * Deliveries a rider could not complete, with whether each still needs
     * recovering.
     *
     * A failure is an assignment marked failed — or one that carries a failure
     * reason, which is how failures look after older code overwrote their
     * status on reassignment. It needs recovery while its order is still
     * NOT_RECEIVED and nothing newer has been assigned; after that it is
     * history, and sending it back again would be a no-op.
     */
    async getFailedDeliveries(query: FailedDeliveriesQuery) {
        const { page, limit } = query;
        const needsRecovery = `("order"."status" = :notReceived AND NOT EXISTS (
            SELECT 1 FROM "delivery_assignments" newer
            WHERE newer."orderId" = "assignment"."orderId" AND newer.id > "assignment"."id"
        ))`;

        const qb = this.assignmentRepository
            .createQueryBuilder("assignment")
            .leftJoinAndSelect("assignment.order", "order")
            .leftJoinAndSelect("order.orderedBy", "orderedBy")
            .leftJoinAndSelect("assignment.rider", "rider")
            .where(
                new Brackets((failed) => {
                    failed
                        .where("assignment.assignmentStatus = :failed", {
                            failed: AssignmentStatus.FAILED,
                        })
                        .orWhere("assignment.failureReason IS NOT NULL");
                }),
            )
            .setParameter("notReceived", OrderStatus.NOT_RECEIVED);

        if (query.state === "pending") qb.andWhere(needsRecovery);
        if (query.state === "resolved") qb.andWhere(`NOT ${needsRecovery}`);

        if (query.riderId) {
            qb.andWhere("assignment.riderId = :riderId", { riderId: query.riderId });
        }

        if (query.search) {
            const term = likeTerm(query.search);
            qb.andWhere(
                new Brackets((match) => {
                    match
                        .where("order.orderNumber ILIKE :term", { term })
                        .orWhere("assignment.failureReason ILIKE :term", { term })
                        .orWhere("rider.fullName ILIKE :term", { term })
                        .orWhere("orderedBy.fullName ILIKE :term", { term })
                        .orWhere("orderedBy.phoneNumber ILIKE :term", { term });
                }),
            );
        }

        // Pending first: the top of the list is the work still to do.
        const [rows, total] = await qb
            .orderBy(`CASE WHEN ${needsRecovery} THEN 0 ELSE 1 END`, "ASC")
            .addOrderBy("assignment.updatedAt", "DESC")
            .addOrderBy("assignment.id", "DESC")
            .offset((page - 1) * limit)
            .limit(limit)
            .getManyAndCount();

        const latest = await this.latestAssignmentIds(rows.map((row) => row.orderId));

        return {
            data: rows.map((row) => ({
                ...sanitizeAssignmentForDelivery(row),
                needsRecovery:
                    row.order?.status === OrderStatus.NOT_RECEIVED &&
                    latest.get(row.orderId) === row.id,
            })),
            pagination: paginationOf(total, page, limit),
        };
    }

    private async latestAssignmentIds(orderIds: number[]): Promise<Map<number, number>> {
        if (orderIds.length === 0) return new Map();
        const rows: { orderId: number; id: number }[] = await this.assignmentRepository
            .createQueryBuilder("assignment")
            .select(`"assignment"."orderId"`, "orderId")
            .addSelect(`MAX("assignment"."id")`, "id")
            .where("assignment.orderId IN (:...orderIds)", { orderIds: [...new Set(orderIds)] })
            .groupBy(`"assignment"."orderId"`)
            .getRawMany();
        return new Map(rows.map((row) => [Number(row.orderId), Number(row.id)]));
    }
}

/** Order states the delivery page can send back to the warehouse. */
const RECOVERABLE_STATUSES = [
    OrderStatus.ARRIVED_AT_WAREHOUSE,
    OrderStatus.ASSIGNED_TO_RIDER,
    OrderStatus.NOT_RECEIVED,
];

/** A rider row with what they are carrying, `onDelivery` derived from it. */
function withRiderLoad(
    rider: Rider,
    load: { activeDeliveries?: number; completedDeliveries?: number } = rider as any,
) {
    const activeDeliveries = Number(load.activeDeliveries ?? 0);
    return {
        ...sanitizeRiderForDelivery(rider),
        onDelivery: activeDeliveries > 0,
        activeDeliveries,
        completedDeliveries: Number(load.completedDeliveries ?? 0),
    };
}

/** A contains-match for ILIKE, with the user's own `%` and `_` taken literally. */
export function likeTerm(search: string): string {
    return `%${search.replace(/[\\%_]/g, "\\$&")}%`;
}

function paginationOf(total: number, page: number, limit: number) {
    return { total, currentPage: page, totalPages: Math.ceil(total / limit) };
}
