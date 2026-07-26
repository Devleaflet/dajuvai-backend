import { readFileSync } from "fs";
import { join } from "path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

const files = {
    variantEntity: read("src/entities/variant.entity.ts"),
    productEntity: read("src/entities/product.entity.ts"),
    orderItemEntity: read("src/entities/orderItems.entity.ts"),
    orderInterface: read("src/interface/order.interface.ts"),
    productService: read("src/service/product.service.ts"),
    productController: read("src/controllers/product.controller.ts"),
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
    [
        /@DeleteDateColumn\(\{\s*name:\s*["']deleted_at["']/.test(
            files.variantEntity,
        ),
        "Variant must have a soft-delete column so it can be archived instead of hard-deleted",
    ],
    [
        /orphanedRowAction:\s*["']soft-delete["']/.test(files.productEntity) &&
            /orphanedRowAction:\s*["']soft-delete["']/.test(
                files.variantEntity,
            ),
        "Both sides of the Product<->Variant relation must set orphanedRowAction: 'soft-delete' (TypeORM reads it off the inverse/ManyToOne side, defaulting to 'nullify' there otherwise)",
    ],
    [
        !files.productService.includes("deleteVariantsSafely"),
        "ProductService must not block hasVariants toggling on order history - variants are always archived instead",
    ],
    [
        !files.productService.includes(
            "can't be removed because they have order history",
        ),
        "Switching a product's variant structure must never surface an order-history conflict to vendors/admins",
    ],
    [
        /@DeleteDateColumn\(\{\s*name:\s*["']deleted_at["']/.test(
            files.productEntity,
        ),
        "Product must have a soft-delete column so it can be archived instead of hard-deleted",
    ],
    [
        !files.productService.includes("assertNoOrderHistory"),
        "Deleting a product must never block on order history - it must always archive instead",
    ],
    [
        !files.productService.includes(
            "existing orders and can't be deleted",
        ),
        "Deleting a product must never surface an order-history conflict to vendors/admins",
    ],
    [
        files.productService.includes(".softDelete(id)") &&
            files.productService.includes(".softDelete(variantIds)"),
        "deleteProductById must archive product + its variants via the bulk .softDelete() query (SQL CURRENT_TIMESTAMP), not cascading .softRemove(entity) (per-entity JS Date - parent/children get different instants, breaking restoreProduct's same-delete correlation)",
    ],
    [
        files.productService.includes("removeFromCartsAndWishlists"),
        "Deleting a product must clean up cart/wishlist rows referencing it, since archiving no longer triggers the DB's onDelete cascade",
    ],
    [
        files.productService.includes("async restoreProduct(") &&
            files.productService.includes("async restoreVariant("),
        "ProductService must expose restoreProduct and restoreVariant so vendors/admins can undo an archive",
    ],
    [
        files.productService.includes(
            "SELECT p.deleted_at FROM products p WHERE p.id = :id",
        ),
        "restoreProduct must correlate sibling variants via a SQL subquery, not a JS-Date round-trip of product.deletedAt (loses sub-millisecond precision vs what Postgres stored)",
    ],
    [
        !files.productService.includes("async deleteProduct("),
        "The dead, unreachable deleteProduct(id, subcategoryId, userId) method must stay removed - only deleteProductById is wired to a route",
    ],
    [
        files.productService.includes("interface ProductActor") &&
            !files.productController.includes(
                "req.user?.id || req.vendor?.id",
            ),
        "Ownership checks must take an explicit {userId, vendorId} actor, never a merged bare id - User and Vendor are separate tables whose ids can collide",
    ],
    [
        files.productService.includes("normalizeVariantImages"),
        "Each variant must be required to carry at least one image - a variant product has no product-level image to fall back to",
    ],
    [
        files.productService.includes("product.productImages = null;"),
        "A variant product must have product.productImages cleared server-side regardless of what the request sent, not just when the request happens to omit it",
    ],
    [
        !files.productService.includes("async getArchivedVariants("),
        "getArchivedVariants must stay removed - superseded by the unified getArchivedProducts list (products archived AND products with archived variants, in one feed)",
    ],
    [
        (() => {
            const m = files.productService.match(
                /async restoreVariant\([\s\S]*?\n {2}\}/,
            );
            return (
                !!m &&
                m[0].includes("hasVariants = true") &&
                m[0].includes("aggregateVariantInventory")
            );
        })(),
        "restoreVariant must flip the product back to hasVariants:true and recompute stock, or the restored variant sits active-but-invisible (every read gates variants on hasVariants)",
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
