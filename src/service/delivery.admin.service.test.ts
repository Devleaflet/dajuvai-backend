import { beforeEach, describe, expect, it, vi } from "vitest";

const { findOne, transaction, changeOrderStatus } = vi.hoisted(() => ({
    findOne: vi.fn(),
    transaction: vi.fn(),
    changeOrderStatus: vi.fn(),
}));

vi.mock("../config/db.config", () => ({
    default: { getRepository: () => ({ findOne }), transaction },
}));
vi.mock("./order.service", () => ({
    OrderService: class {
        changeOrderStatus = changeOrderStatus;
    },
}));

import { DeliveryAdminService, likeTerm } from "./delivery.admin.service";
import { AuditActorType } from "../entities/auditLog.entity";
import { OrderStatus } from "../entities/order.entity";
import {
    deliveryAssignmentsQuerySchema,
    deliveryOrdersQuerySchema,
    failedDeliveriesQuerySchema,
} from "../utils/zod_validations/delivery.zod";

describe("delivery list queries", () => {
    it("defaults what older clients leave out", () => {
        expect(deliveryOrdersQuerySchema.parse({})).toEqual({
            page: 1,
            limit: 20,
            sort: "newest",
            search: undefined,
            statuses: undefined,
        });
        // The failed list used to be unpaged; asking for nothing still gets it whole.
        expect(failedDeliveriesQuerySchema.parse({}).limit).toBe(100);
    });

    it("refuses an unknown status instead of sending it to Postgres", () => {
        expect(deliveryOrdersQuerySchema.safeParse({ statuses: "DELIVERED,FOO" }).success).toBe(false);
        expect(
            deliveryOrdersQuerySchema.parse({ statuses: "DELIVERED, NOT_RECEIVED," }).statuses,
        ).toEqual([OrderStatus.DELIVERED, OrderStatus.NOT_RECEIVED]);
    });

    it("treats a blank search as no search", () => {
        expect(deliveryAssignmentsQuerySchema.parse({ search: "   " }).search).toBeUndefined();
        expect(deliveryAssignmentsQuerySchema.parse({ search: " DJV-1 " }).search).toBe("DJV-1");
    });

    it("caps the page size", () => {
        expect(deliveryAssignmentsQuerySchema.safeParse({ limit: "100" }).success).toBe(true);
        expect(deliveryAssignmentsQuerySchema.safeParse({ limit: "101" }).success).toBe(false);
    });

    it("accepts an assignment status or 'active', nothing else", () => {
        expect(deliveryAssignmentsQuerySchema.parse({ status: "active" }).status).toBe("active");
        expect(deliveryAssignmentsQuerySchema.parse({ status: "failed" }).status).toBe("failed");
        expect(deliveryAssignmentsQuerySchema.safeParse({ status: "lost" }).success).toBe(false);
    });
});

describe("likeTerm", () => {
    it("takes the user's wildcards literally", () => {
        expect(likeTerm("50%_off")).toBe("%50\\%\\_off%");
        expect(likeTerm("a\\b")).toBe("%a\\\\b%");
    });
});

describe("backToWarehouse", () => {
    beforeEach(() => {
        findOne.mockReset();
        transaction.mockReset();
        changeOrderStatus.mockReset();
    });

    it.each([OrderStatus.DELIVERED, OrderStatus.CANCELLED, OrderStatus.RETURNED])(
        "refuses a %s order rather than un-delivering or reviving it",
        async (status) => {
            findOne.mockResolvedValue({ id: 7, status });

            await expect(
                new DeliveryAdminService().backToWarehouse(7, 1, AuditActorType.ADMIN),
            ).rejects.toMatchObject({ status: 400 });
            expect(transaction).not.toHaveBeenCalled();
            expect(changeOrderStatus).not.toHaveBeenCalled();
        },
    );

    it("clears only open assignments, keeping a failure on record", async () => {
        findOne.mockResolvedValue({ id: 7, status: OrderStatus.NOT_RECEIVED });
        const find = vi.fn().mockResolvedValue([]);
        const query = vi.fn();
        transaction.mockImplementation((work: any) => work({ find, save: vi.fn(), query }));

        await new DeliveryAdminService().backToWarehouse(7, 1, AuditActorType.ADMIN);

        const where = find.mock.calls[0][1].where;
        expect(where.orderId).toBe(7);
        // An In(...) over the open statuses — "failed" is not among them.
        expect(where.assignmentStatus.value).toEqual(["assigned", "picked_up"]);
        expect(changeOrderStatus).toHaveBeenCalledWith(
            7,
            OrderStatus.ARRIVED_AT_WAREHOUSE,
            expect.objectContaining({ actorRole: "ADMIN" }),
        );
    });
});
