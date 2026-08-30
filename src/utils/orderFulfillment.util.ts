import { ItemFulfillmentStatus } from "../entities/orderItems.entity";

interface FulfillmentLine {
    fulfillmentStatus: ItemFulfillmentStatus;
    price: string | number;
    quantity: number;
    unitPriceSnapshot?: string | number | null;
}

const toNumber = (value: unknown, fallback = 0): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Final payable value of one order line — the unit price the customer was
 * actually going to pay (unitPriceSnapshot, i.e. price after item-level
 * product discounts and deal reductions, falling back to price) times
 * quantity. Mirrors buildOrderItemPriceBreakdown().lineTotal so the
 * cancelled amount never uses list prices the customer would never have
 * paid (spec §9.1).
 */
export const itemLineTotal = (item: FulfillmentLine): number =>
    toNumber(item.unitPriceSnapshot ?? item.price) * toNumber(item.quantity);

/**
 * Server-side cancelled amount (spec §9/§9.1/§11): sum of the final
 * payable line values of CANCELLED items only. Always computed here from
 * persisted order-item pricing data — never trust a client-supplied value.
 */
export const computeCancelledAmount = (items: FulfillmentLine[]): number =>
    items
        .filter(
            (item) =>
                item.fulfillmentStatus === ItemFulfillmentStatus.CANCELLED,
        )
        .reduce((sum, item) => sum + itemLineTotal(item), 0);
