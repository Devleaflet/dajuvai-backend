import { describe, expect, it } from "vitest";

import { OrderStatus } from "../entities/order.entity";
import { updateOrderStatusSchema } from "../utils/zod_validations/order.zod";
import {
    CUSTOMER_EMAIL_STATUSES,
    customerFacingReason,
    VENDOR_EMAIL_STATUSES,
} from "./orderStatus.constants";

describe("order status notification policy", () => {
    it("emails only on statuses that matter", () => {
        expect([...CUSTOMER_EMAIL_STATUSES].sort()).toEqual(
            ["CANCELLED", "DELAYED", "DELIVERED", "NOT_RECEIVED", "RETURNED"],
        );
        expect(VENDOR_EMAIL_STATUSES.has(OrderStatus.CONFIRMED)).toBe(false);
        expect(VENDOR_EMAIL_STATUSES.has(OrderStatus.CANCELLED)).toBe(true);
    });

    it("passes a reason to the customer only for delays and failures", () => {
        expect(customerFacingReason(OrderStatus.DELAYED, " Roads closed ")).toBe("Roads closed");
        expect(customerFacingReason(OrderStatus.CANCELLED, "Out of stock")).toBe("Out of stock");
        expect(customerFacingReason(OrderStatus.CONFIRMED, "Checked stock with vendor")).toBeUndefined();
        expect(customerFacingReason(OrderStatus.CANCELLED, "   ")).toBeUndefined();
    });

    it("requires a reason exactly where the customer is told one", () => {
        expect(updateOrderStatusSchema.safeParse({ status: "CONFIRMED" }).success).toBe(true);
        expect(updateOrderStatusSchema.safeParse({ status: "DELAYED" }).success).toBe(false);
        expect(updateOrderStatusSchema.safeParse({ status: "CANCELLED", reason: "  " }).success).toBe(false);
        expect(
            updateOrderStatusSchema.safeParse({ status: "CANCELLED", reason: "Customer request" }).success,
        ).toBe(true);
    });
});
