import { describe, expect, it } from "vitest";
import { ItemFulfillmentStatus } from "../entities/orderItems.entity";
import {
    computeCancelledAmount,
    itemLineTotal,
} from "./orderFulfillment.util";

type Line = {
    fulfillmentStatus: ItemFulfillmentStatus;
    price: string | number;
    quantity: number;
    unitPriceSnapshot?: string | number | null;
};

describe("itemLineTotal", () => {
    it("uses unitPriceSnapshot when present (spec §9.1: 999 - 99.90 deal => 899.10)", () => {
        const line: Line = {
            fulfillmentStatus: ItemFulfillmentStatus.CANCELLED,
            price: "999.00",
            quantity: 1,
            unitPriceSnapshot: "899.10",
        };
        expect(itemLineTotal(line)).toBeCloseTo(899.1);
    });

    it("falls back to price and multiplies by quantity", () => {
        expect(
            itemLineTotal({
                fulfillmentStatus: ItemFulfillmentStatus.CONFIRMED,
                price: "4000",
                quantity: 2,
            }),
        ).toBeCloseTo(8000);
    });

    it("treats missing/invalid values as zero instead of NaN", () => {
        expect(
            itemLineTotal({
                fulfillmentStatus: ItemFulfillmentStatus.PENDING,
                price: "not-a-number",
                quantity: 3,
            }),
        ).toBe(0);
    });
});

describe("computeCancelledAmount", () => {
    it("sums only CANCELLED items at final payable line value", () => {
        const items: Line[] = [
            {
                fulfillmentStatus: ItemFulfillmentStatus.CONFIRMED,
                price: "4000",
                quantity: 1,
            },
            {
                fulfillmentStatus: ItemFulfillmentStatus.CANCELLED,
                price: "999",
                quantity: 1,
                unitPriceSnapshot: "899.10",
            },
            {
                fulfillmentStatus: ItemFulfillmentStatus.PENDING,
                price: "500",
                quantity: 3,
            },
        ];
        expect(computeCancelledAmount(items)).toBeCloseTo(899.1);
    });

    it("sums multiple cancelled items including quantity multiples", () => {
        const items: Line[] = [
            {
                fulfillmentStatus: ItemFulfillmentStatus.CANCELLED,
                price: "100",
                quantity: 2,
            },
            {
                fulfillmentStatus: ItemFulfillmentStatus.CANCELLED,
                price: "50.5",
                quantity: 1,
            },
        ];
        expect(computeCancelledAmount(items)).toBeCloseTo(250.5);
    });

    it("returns 0 with no cancelled items or an empty list", () => {
        expect(
            computeCancelledAmount([
                {
                    fulfillmentStatus: ItemFulfillmentStatus.CONFIRMED,
                    price: "999",
                    quantity: 1,
                },
            ]),
        ).toBe(0);
        expect(computeCancelledAmount([])).toBe(0);
    });
});
