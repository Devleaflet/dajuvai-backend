import { readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const files = {
    variantEntity: read("src/entities/variant.entity.ts"),
    orderItemEntity: read("src/entities/orderItems.entity.ts"),
    orderInterface: read("src/interface/order.interface.ts"),
    productService: read("src/service/product.service.ts"),
    cartService: read("src/service/cart.service.ts"),
    wishlistService: read("src/service/wishlist.service.ts"),
    orderService: read("src/service/order.service.ts"),
};

const failures: string[] = [];

const checks: Array<[boolean, string]> = [
    [/id:\s*number/.test(files.variantEntity), "Variant.id must be number"],
    [
        /productId:\s*number/.test(files.variantEntity),
        "Variant.productId must be number",
    ],
    [
        /@Column\(\{\s*name:\s*["']product_id["']/.test(files.variantEntity),
        "Variant.productId must map to product_id join column",
    ],
    [
        /variantId\??:\s*number/.test(files.orderItemEntity),
        "OrderItem.variantId must be number",
    ],
    [
        /variantId\??:\s*number/.test(files.orderInterface),
        "Order create request variantId must be number",
    ],
    [
        !files.cartService.includes("variantId.toString()") &&
            !files.cartService.includes("productId.toString()"),
        "CartService must query variants with numeric IDs",
    ],
    [
        !files.wishlistService.includes("variantId.toString()") &&
            !files.wishlistService.includes("productId.toString()"),
        "WishlistService must query variants with numeric IDs",
    ],
    [
        !files.productService.includes("productId.toString()") &&
            !files.productService.includes("savedProduct.id.toString()"),
        "ProductService must persist numeric variant productId",
    ],
    [
        !files.orderService.includes("getTreeRepository(Variant)"),
        "OrderService must use regular repository for Variant",
    ],
    [
        !files.productService.includes(
            '.where("(product.stock > 0 OR variants.stock > 0)")',
        ),
        "Public product listing must include out-of-stock products for status display",
    ],
    [
        files.productService.includes("normalizeVariantInput") &&
            files.productService.includes("aggregateVariantInventory"),
        "ProductService must normalize variants and aggregate variant stock",
    ],
    [
        files.orderService.includes("syncVariantParentProducts"),
        "OrderService must sync parent product stock after variant stock changes",
    ],
    [
        files.orderService.includes("await this.cartService.clearCart(order.orderedById)") &&
            !files.orderService.includes(
                "await this.cartService.removeFromCart(order.orderedById",
            ),
        "Online payment verification must clear all ordered cart items",
    ],
];

for (const [passed, message] of checks) {
    if (!passed) {
        failures.push(message);
    }
}

if (failures.length > 0) {
    console.error("Product self-check failed:");
    for (const failure of failures) {
        console.error(`- ${failure}`);
    }
    process.exit(1);
}

console.log("Product self-check passed");
