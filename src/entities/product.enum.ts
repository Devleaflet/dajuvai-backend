export enum ProductSortOption {
    NAME_A_Z = "a-z",
    NAME_Z_A = "z-a",
    PRICE_HIGH_LOW = "price-high-low",
    PRICE_LOW_HIGH = "price-low-high",
    STOCK_HIGH_LOW = "stock-high-low",
    STOCK_LOW_HIGH = "stock-low-high",
    NEWEST = "newest",
    OLDEST = "oldest",
}

export enum InventoryStatus {
    AVAILABLE = "AVAILABLE",
    OUT_OF_STOCK = "OUT_OF_STOCK",
    LOW_STOCK = "LOW_STOCK",
}

export enum DiscountType {
    NONE = "NONE",
    PERCENTAGE = "PERCENTAGE",
    FLAT = "FLAT",
}
