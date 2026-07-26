import { DiscountType } from "../entities/product.enum";

export interface PriceSnapshotInput {
    basePrice: number | string | null | undefined;
    discount?: number | string | null;
    discountType?: DiscountType | string | null;
    dealDiscountPercentage?: number | string | null;
}

export interface PriceSnapshot {
    basePrice: number;
    discountType: DiscountType;
    discountValue: number;
    discountAmount: number;
    dealDiscountAmount: number;
    finalPrice: number;
    savingsAmount: number;
}

const toFiniteMoney = (value: unknown, field: string): number => {
    const amount = Number(value ?? 0);

    if (!Number.isFinite(amount)) {
        throw new Error(`${field} must be a valid number`);
    }

    if (amount < 0) {
        throw new Error(`${field} must be non-negative`);
    }

    return amount;
};

const toMinorUnits = (value: number): number => Math.round(value * 100);
const fromMinorUnits = (value: number): number => Number((value / 100).toFixed(2));

export const normalizeDiscountType = (
    value?: DiscountType | string | null,
): DiscountType => {
    if (value === DiscountType.PERCENTAGE || value === DiscountType.FLAT) {
        return value;
    }
    return DiscountType.NONE;
};

export const calculatePriceSnapshot = (
    input: PriceSnapshotInput,
): PriceSnapshot => {
    const basePrice = toFiniteMoney(input.basePrice, "Base price");
    const discountValue = toFiniteMoney(input.discount ?? 0, "Discount");
    const dealDiscountPercentage = toFiniteMoney(
        input.dealDiscountPercentage ?? 0,
        "Deal discount",
    );

    const discountType =
        discountValue > 0
            ? normalizeDiscountType(input.discountType ?? DiscountType.PERCENTAGE)
            : DiscountType.NONE;

    const baseMinor = toMinorUnits(basePrice);
    let discountMinor = 0;

    if (discountType === DiscountType.PERCENTAGE) {
        if (discountValue > 100) {
            throw new Error("Percentage discount cannot exceed 100");
        }
        discountMinor = Math.round((baseMinor * discountValue) / 100);
    }

    if (discountType === DiscountType.FLAT) {
        discountMinor = Math.min(toMinorUnits(discountValue), baseMinor);
    }

    const afterProductDiscountMinor = Math.max(0, baseMinor - discountMinor);

    if (dealDiscountPercentage > 100) {
        throw new Error("Deal discount cannot exceed 100");
    }

    const dealDiscountMinor = Math.round(
        (afterProductDiscountMinor * dealDiscountPercentage) / 100,
    );
    const finalMinor = Math.max(
        0,
        afterProductDiscountMinor - dealDiscountMinor,
    );
    const totalSavingsMinor = baseMinor - finalMinor;

    return {
        basePrice: fromMinorUnits(baseMinor),
        discountType,
        discountValue: fromMinorUnits(toMinorUnits(discountValue)),
        discountAmount: fromMinorUnits(discountMinor),
        dealDiscountAmount: fromMinorUnits(dealDiscountMinor),
        finalPrice: fromMinorUnits(finalMinor),
        savingsAmount: fromMinorUnits(totalSavingsMinor),
    };
};

export interface ResolveFinalPriceInput {
    finalPrice?: number | string | null;
    basePrice: number | string | null | undefined;
    discountAmount?: number | string | null;
}

export const resolveFinalPrice = (input: ResolveFinalPriceInput): number => {
    const persisted = Number(input.finalPrice);
    if (Number.isFinite(persisted) && persisted >= 0) {
        return persisted;
    }

    return calculatePriceSnapshot({
        basePrice: input.basePrice,
        discount: input.discountAmount,
        discountType: DiscountType.FLAT,
    }).finalPrice;
};


// Shape expected by the normalizers.
// Both Product and Variant satisfy this interface.
// Any extra fields are preserved via the spread in callers.
export interface LegacyDiscountNormalizableRecord {
    basePrice?: number | string | null;
    discount?: number | string | null;
    discountType?: DiscountType | string | null;
    discountAmount?: number | string | null;
    discountPercent?: number | string | null;
}

/**
 * Given a record that may be a legacy product (discount stored in discount,
 * discountAmount and discountPercent both 0), returns a **new** object
 * with discountAmount and discountPercent correctly computed.
 *
 * Rules:
 *  - discountType === NONE → no change
 *  - discountAmount > 0 OR discountPercent > 0 → already new-system, no change
 *  - otherwise → derive both fields from discount + discountType + basePrice
 *
 * The legacy discount field is always preserved.
 */
export function normalizeLegacyProductDiscount<
    T extends LegacyDiscountNormalizableRecord,
>(record: T): T {
    const dType = record.discountType ?? DiscountType.NONE;

    // Rule 1: NONE discount — nothing to fix
    if (dType === DiscountType.NONE) return record;

    const dAmount = Number(record.discountAmount ?? 0);
    const dPercent = Number(record.discountPercent ?? 0);

    // Rule 3: already on the new system — do not overwrite
    if (dAmount > 0 || dPercent > 0) return record;

    // Rule 2: legacy record — derive both fields
    const base = Number(record.basePrice ?? 0);
    const legacyDiscount = Number(record.discount ?? 0);

    if (base <= 0 || legacyDiscount <= 0) return record;

    let computedAmount = 0;
    let computedPercent = 0;

    if (dType === DiscountType.FLAT) {
        computedAmount = legacyDiscount;
        computedPercent = Number(((legacyDiscount / base) * 100).toFixed(2));
    } else if (dType === DiscountType.PERCENTAGE) {
        computedPercent = legacyDiscount;
        computedAmount = Number(((base * legacyDiscount) / 100).toFixed(2));
    }

    return {
        ...record,
        discountAmount: computedAmount,
        discountPercent: computedPercent,
    };
}


// Same as normalize for product,
// Separate so that we can call it explicitly
export function normalizeLegacyVariantDiscount<
    T extends LegacyDiscountNormalizableRecord,
>(record: T): T {
    return normalizeLegacyProductDiscount(record);
}

export const calculateLineTotal = (
    unitFinalPrice: number | string,
    quantity: number,
): number => {
    const unit = toFiniteMoney(unitFinalPrice, "Unit final price");
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error("Quantity must be a positive whole number");
    }

    return fromMinorUnits(toMinorUnits(unit) * quantity);
};
