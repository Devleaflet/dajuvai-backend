import { EntityManager } from "typeorm";

import { CheckoutDraft, CheckoutDraftStatus } from "../entities/checkoutDraft.entity";
import { APIError } from "../errors/ApiError";

/**
 * Why a line can't be filled as asked:
 * - SOLD_OUT: nothing left on the shelf.
 * - LOW_STOCK: some left, fewer than asked for.
 * - UNAVAILABLE: the product, or the option chosen, is gone or hidden.
 */
export type StockIssueReason = "SOLD_OUT" | "LOW_STOCK" | "UNAVAILABLE";

export interface StockIssue {
    cartItemId: number | null;
    productId: number | null;
    variantId: number | null;
    name: string;
    requested: number;
    available: number;
    reason: StockIssueReason;
}

interface StockLine {
    id?: number;
    quantity: number;
    /** Set on a cart line for an option; its `variant` is gone if deleted. */
    variantId?: number | null;
    product?: {
        id: number;
        name?: string;
        stock?: number | null;
        status?: string | null;
        hasVariants?: boolean;
        deletedAt?: Date | null;
    } | null;
    variant?: {
        id: number;
        stock?: number | null;
        status?: string | null;
        attributes?: Record<string, unknown> | null;
    } | null;
}

const onShelf = (row: { stock?: number | null; status?: string | null }) =>
    row.status === "OUT_OF_STOCK" ? 0 : Math.max(0, Number(row.stock) || 0);

/** Key of a stock row in a holds map: the variant when there is one. */
export const holdKey = (productId: number, variantId: number | null | undefined) =>
    variantId ? `v:${variantId}` : `p:${productId}`;

/**
 * What this shopper's unpaid online checkouts hold, by holdKey. That stock
 * is off the shelf but still theirs: a shopper who backs out of the gateway
 * and checks out again must not be told their own item sold out.
 */
export async function stockHeldBy(manager: EntityManager, userId: number): Promise<Map<string, number>> {
    const drafts = await manager.getRepository(CheckoutDraft).find({
        select: { id: true, items: true },
        where: { userId, status: CheckoutDraftStatus.PENDING, stockHeld: true },
    });
    const held = new Map<string, number>();
    for (const item of drafts.flatMap((draft) => draft.items ?? [])) {
        const key = holdKey(item.productId, item.variantId);
        held.set(key, (held.get(key) ?? 0) + item.quantity);
    }
    return held;
}

function lineName(line: StockLine): string {
    const name = line.product?.name ?? "An item";
    const options = Object.entries(line.variant?.attributes ?? {})
        .map(([key, value]) => `${key}: ${value}`)
        .join(", ");
    return options ? `${name} (${options})` : name;
}

/**
 * What stands between a line and its order, or null when the shelf can fill
 * it. Cart, estimate and checkout all ask this one question, so the shopper
 * sees the same verdict on every screen. `hiddenProductIds` are products the
 * public catalogue no longer shows; `heldByShopper` is stockHeldBy().
 */
export function lineStockIssue(
    line: StockLine,
    hiddenProductIds?: Set<number>,
    heldByShopper?: Map<string, number>,
): StockIssue | null {
    const product = line.product;
    const base = {
        cartItemId: line.id ?? null,
        productId: product?.id ?? null,
        variantId: line.variant?.id ?? line.variantId ?? null,
        name: lineName(line),
        requested: line.quantity,
    };

    if (
        !product ||
        product.deletedAt ||
        hiddenProductIds?.has(product.id) ||
        (line.variantId && !line.variant) ||
        (product.hasVariants && !line.variant)
    ) {
        return { ...base, available: 0, reason: "UNAVAILABLE" };
    }

    const available =
        onShelf(line.variant ?? product) + (heldByShopper?.get(holdKey(product.id, line.variant?.id)) ?? 0);
    if (available === 0) return { ...base, available, reason: "SOLD_OUT" };
    if (line.quantity > available) return { ...base, available, reason: "LOW_STOCK" };
    return null;
}

function describe(issue: StockIssue, alone: boolean): string {
    const name = `"${issue.name}"`;
    if (issue.reason === "LOW_STOCK") {
        return alone
            ? `Only ${issue.available} of ${name} left — you asked for ${issue.requested}.`
            : `only ${issue.available} of ${name} left`;
    }
    if (issue.reason === "SOLD_OUT") return alone ? `${name} just sold out.` : `${name} sold out`;
    return alone ? `${name} is no longer available.` : `${name} is no longer available`;
}

/**
 * The answer when another shopper got there first: a 409 that names every
 * line affected, so the client can show what changed and let the shopper
 * decide, instead of a bare "insufficient stock".
 */
export function stockIssueError(issues: StockIssue[]): APIError {
    // "Review", not "remove": a checkout that sent its lines has already
    // taken this one out of the order and re-priced it.
    const next = "Review your order, then place it again.";
    const message =
        issues.length === 1
            ? `${describe(issues[0], true)} ${next}`
            : `Some items just changed: ${issues.map((issue) => describe(issue, false)).join("; ")}. ${next}`;
    return new APIError(409, message, "INSUFFICIENT_STOCK", true, { items: issues });
}
