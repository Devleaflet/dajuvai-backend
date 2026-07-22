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
    discount?: number | string | null;
    discountType?: DiscountType | string | null;
}

export const resolveFinalPrice = (input: ResolveFinalPriceInput): number => {
    const persisted = Number(input.finalPrice);
    if (Number.isFinite(persisted) && persisted >= 0) {
        return persisted;
    }

    return calculatePriceSnapshot({
        basePrice: input.basePrice,
        discount: input.discount,
        discountType: input.discountType,
    }).finalPrice;
};

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
