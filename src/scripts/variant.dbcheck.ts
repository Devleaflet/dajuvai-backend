/**
 * Integration check for variant soft-delete against a real Postgres.
 *
 *   npx ts-node src/scripts/variant.dbcheck.ts
 *
 * Covers what only breaks against a real database: switching a product
 * between "normal" and "has variants" must always succeed (never throw
 * "product_id cannot be null" or a 409 order-history conflict), a removed
 * variant must be archived (deletedAt set) rather than hard-deleted or
 * orphaned, archived variants must disappear from storefront reads, an
 * existing order's line items must keep showing full variant/product data
 * (sku, attributes, name) even after the variant/product behind them is
 * archived, deleting a whole product (with or without order history) must
 * always archive it instead of throwing, and cart/wishlist entries pointing
 * at an archived product must be cleaned up rather than left dangling.
 *
 * It creates its own throwaway product/variant/order under a dedicated
 * vendor+category+subcategory (`dbcheck-tmp`) and deletes all of it in a
 * finally block, so it is safe against a populated database.
 */
import assert from "assert";
import AppDataSource from "../config/db.config";
import { ProductService } from "../service/product.service";
import { OrderService } from "../service/order.service";
import { Variant } from "../entities/variant.entity";
import { Category } from "../entities/category.entity";
import { Subcategory } from "../entities/subcategory.entity";
import { Vendor } from "../entities/vendor.entity";
import { User } from "../entities/user.entity";
import { Order, PaymentMethod } from "../entities/order.entity";
import { OrderItem } from "../entities/orderItems.entity";
import { Product } from "../entities/product.entity";
import { Cart } from "../entities/cart.entity";
import { CartItem } from "../entities/cartItem.entity";
import { Wishlist } from "../entities/wishlist.entity";
import { WishlistItem } from "../entities/wishlistItem.entity";

const TAG = "dbcheck-variant-tmp";
const ok = (m: string) => console.log(`  ok - ${m}`);

async function cleanup() {
    await AppDataSource.query(
        `DELETE FROM "order_items" WHERE "productId" IN (SELECT "id" FROM "products" WHERE "name" LIKE $1)`,
        [`${TAG}%`],
    );
    await AppDataSource.query(
        `DELETE FROM "orders" WHERE "orderNumber" LIKE $1`,
        [`${TAG}%`],
    );
    await AppDataSource.query(
        `DELETE FROM "cart_items" WHERE "cart_id" IN (SELECT "id" FROM "carts" WHERE "userId" IN (SELECT "id" FROM "user" WHERE "email" = $1))`,
        [`${TAG}@example.com`],
    );
    await AppDataSource.query(
        `DELETE FROM "carts" WHERE "userId" IN (SELECT "id" FROM "user" WHERE "email" = $1)`,
        [`${TAG}@example.com`],
    );
    await AppDataSource.query(
        `DELETE FROM "wishlist_items" WHERE "wishlist_id" IN (SELECT "id" FROM "wishlists" WHERE "userId" IN (SELECT "id" FROM "user" WHERE "email" = $1))`,
        [`${TAG}@example.com`],
    );
    await AppDataSource.query(
        `DELETE FROM "wishlists" WHERE "userId" IN (SELECT "id" FROM "user" WHERE "email" = $1)`,
        [`${TAG}@example.com`],
    );
    await AppDataSource.query(
        `DELETE FROM "variants" WHERE "product_id" IN (SELECT "id" FROM "products" WHERE "name" LIKE $1)`,
        [`${TAG}%`],
    );
    await AppDataSource.query(`DELETE FROM "products" WHERE "name" LIKE $1`, [
        `${TAG}%`,
    ]);
    await AppDataSource.query(
        `DELETE FROM "vendor" WHERE "businessName" IN ($1, $2)`,
        [TAG, `${TAG}-intruder`],
    );
    await AppDataSource.query(`DELETE FROM "user" WHERE "email" = $1`, [
        `${TAG}@example.com`,
    ]);
    await AppDataSource.query(`DELETE FROM "subcategory" WHERE "name" = $1`, [
        TAG,
    ]);
    await AppDataSource.query(`DELETE FROM "category" WHERE "name" = $1`, [
        TAG,
    ]);
}

(async () => {
    await AppDataSource.initialize();
    console.log("variant soft-delete db-check");
    const productService = new ProductService(AppDataSource);
    const orderService = new OrderService();

    try {
        await cleanup();

        // ---- fixtures ----
        const category = await AppDataSource.getRepository(Category).save({
            name: TAG,
            image: "https://example.com/x.png",
        } as any);
        const subcategory = await AppDataSource.getRepository(
            Subcategory,
        ).save({
            name: TAG,
            category,
            image: "https://example.com/x.png",
        } as any);
        const user = await AppDataSource.getRepository(User).save({
            email: `${TAG}@example.com`,
            fullName: TAG,
        } as any);
        const vendor = await AppDataSource.getRepository(Vendor).save({
            businessName: TAG,
            email: `${TAG}-vendor@example.com`,
            password: "not-a-real-hash",
            phoneNumber: "0000000000",
        } as any);

        // ---- 1. create a variant product ----
        let product = await productService.createProduct(
            {
                name: `${TAG} product`,
                hasVariants: true,
                variants: [
                    {
                        sku: `${TAG}-SKU-A`,
                        basePrice: "100",
                        stock: "10",
                        variantImages: ["https://example.com/a.png"],
                        attributes: { color: "Red", size: "L" },
                    } as any,
                ],
                productImages: [],
            } as any,
            category.id,
            subcategory.id,
            vendor.id,
        );
        ok("creates a variant product");

        const variantA = product.variants[0];
        assert.ok(variantA?.id, "variant A must have been persisted");

        // ---- 2. simulate order history against variant A ----
        const order = await AppDataSource.getRepository(Order).save({
            orderNumber: `${TAG}-ORDER-1`,
            orderedById: user.id,
            totalPrice: 100,
            shippingFee: 0,
            paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        } as any);
        await AppDataSource.getRepository(OrderItem).save({
            productId: product.id,
            variantId: variantA.id,
            orderId: order.id,
            quantity: 1,
            price: 100,
            vendorId: vendor.id,
            productNameSnapshot: product.name,
            skuSnapshot: variantA.sku,
            unitPriceSnapshot: 100,
        } as any);
        ok("creates order history against the variant");

        // ---- 3. switch has-variant -> normal: must NOT throw, even with order history ----
        product = await productService.updateProduct(
            vendor.id,
            true,
            product.id,
            {
                hasVariants: false,
                basePrice: "150",
                stock: "5",
                productImages: ["https://example.com/normal.png"],
            } as any,
            category.id,
            subcategory.id,
        );
        assert.strictEqual(
            product.hasVariants,
            false,
            "product must now be a normal (non-variant) product",
        );
        ok("switching variant -> normal succeeds despite order history (no 'product_id cannot be null', no 409)");

        const archivedVariant = await AppDataSource.getRepository(
            Variant,
        ).findOne({ where: { id: variantA.id }, withDeleted: true });
        assert.ok(archivedVariant, "variant row must still exist in the DB");
        assert.ok(
            archivedVariant!.deletedAt,
            "variant must be archived (deletedAt set), not hard-deleted",
        );
        ok("removed variant is archived (soft-deleted), not hard-deleted");

        const activeVariant = await AppDataSource.getRepository(
            Variant,
        ).findOne({ where: { id: variantA.id } });
        assert.strictEqual(
            activeVariant,
            null,
            "archived variant must be excluded from default (active-only) reads",
        );
        ok("archived variant is excluded from default reads");

        const publicView = await productService.getProductById(
            product.id,
            subcategory.id,
        );
        assert.strictEqual(
            publicView?.variants?.length ?? 0,
            0,
            "storefront product view must not show the archived variant",
        );
        ok("storefront product read excludes the archived variant");

        // ---- 4. existing order must still show full variant data post-archive ----
        const orderDetails = await orderService.getOrderDetails(order.id);
        const orderedItem = orderDetails.orderItems.find(
            (i: any) => i.variantId === variantA.id,
        );
        assert.ok(orderedItem, "order item must still be present");
        assert.ok(
            (orderedItem as any).variant,
            "order item's variant relation must still resolve after the variant is archived (withDeleted)",
        );
        assert.strictEqual(
            (orderedItem as any).variant.sku,
            `${TAG}-SKU-A`,
            "archived variant's sku must still be readable from the order",
        );
        assert.strictEqual(
            (orderedItem as any).variant.attributes?.color,
            "Red",
            "archived variant's attributes must still be readable from the order",
        );
        ok("existing order still shows full (archived) variant data - price/sku/attributes intact");

        // ---- 5. switch normal -> has-variant again: must NOT throw ----
        product = await productService.updateProduct(
            vendor.id,
            true,
            product.id,
            {
                hasVariants: true,
                variants: [
                    {
                        sku: `${TAG}-SKU-B`,
                        basePrice: "120",
                        stock: "8",
                        variantImages: ["https://example.com/b.png"],
                        attributes: { color: "Blue", size: "M" },
                    } as any,
                ],
            } as any,
            category.id,
            subcategory.id,
        );
        assert.strictEqual(
            product.hasVariants,
            true,
            "product must be a variant product again",
        );
        assert.strictEqual(
            product.variants.length,
            1,
            "only the newly-added variant must be active",
        );
        assert.strictEqual(product.variants[0].sku, `${TAG}-SKU-B`);
        ok("switching normal -> variant succeeds and only shows the new variant");

        // Old archived variant must remain untouched (still archived, not resurrected).
        const stillArchived = await AppDataSource.getRepository(
            Variant,
        ).findOne({ where: { id: variantA.id }, withDeleted: true });
        assert.ok(
            stillArchived?.deletedAt,
            "previously archived variant must remain archived",
        );
        ok("previously archived variant is not resurrected by a later edit");

        // ---- 6. regression: normal <-> variant round trip with NO order history ----
        let plainProduct = await productService.createProduct(
            {
                name: `${TAG} plain product`,
                hasVariants: false,
                basePrice: "50",
                stock: "20",
                productImages: ["https://example.com/plain.png"],
            } as any,
            category.id,
            subcategory.id,
            vendor.id,
        );
        plainProduct = await productService.updateProduct(
            vendor.id,
            true,
            plainProduct.id,
            {
                hasVariants: true,
                variants: [
                    {
                        sku: `${TAG}-SKU-C`,
                        basePrice: "60",
                        stock: "3",
                        variantImages: ["https://example.com/c.png"],
                    } as any,
                ],
            } as any,
            category.id,
            subcategory.id,
        );
        assert.strictEqual(plainProduct.hasVariants, true);
        plainProduct = await productService.updateProduct(
            vendor.id,
            true,
            plainProduct.id,
            {
                hasVariants: false,
                basePrice: "55",
                stock: "20",
                productImages: ["https://example.com/plain-again.png"],
            } as any,
            category.id,
            subcategory.id,
        );
        assert.strictEqual(plainProduct.hasVariants, false);
        ok("normal -> variant -> normal round trip (no order history) still works");

        // ---- 6b. switching to normal without re-supplying images must be
        // rejected (a variant product carries no product-level images) ----
        await assert.rejects(
            () =>
                productService.updateProduct(
                    vendor.id,
                    true,
                    plainProduct.id,
                    { hasVariants: true, variants: [
                        {
                            sku: `${TAG}-SKU-D`,
                            basePrice: "10",
                            stock: "1",
                            variantImages: ["https://example.com/d.png"],
                        } as any,
                    ] } as any,
                    category.id,
                    subcategory.id,
                ).then(() =>
                    productService.updateProduct(
                        vendor.id,
                        true,
                        plainProduct.id,
                        { hasVariants: false, basePrice: "10", stock: "1" } as any,
                        category.id,
                        subcategory.id,
                    ),
                ),
            /product image is required/i,
            "switching to normal without supplying images must be rejected, not silently save with zero images",
        );
        ok("switching to normal requires product images even if a prior state had none");

        // ---- 6c. properly completing that switch (with images) archives
        // SKU-D while plainProduct itself stays active - this is the
        // "variant archived, product still active" case getArchivedVariants
        // must list ----
        plainProduct = await productService.updateProduct(
            vendor.id,
            true,
            plainProduct.id,
            {
                hasVariants: false,
                basePrice: "10",
                stock: "1",
                productImages: ["https://example.com/plain-final.png"],
            } as any,
            category.id,
            subcategory.id,
        );
        assert.strictEqual(plainProduct.hasVariants, false);
        ok("switching to normal with images succeeds and archives the dropped variant (product stays active)");

        const {
            products: variantsOnlyArchivedList,
            total: variantsOnlyArchivedTotal,
        } = await productService.getArchivedProducts(
            { vendorId: vendor.id },
            1,
            20,
            undefined,
            "variants",
        );
        const plainProductArchivedEntry = variantsOnlyArchivedList.find(
            (p) => p.id === plainProduct.id,
        );
        assert.ok(
            variantsOnlyArchivedTotal >= 1 && plainProductArchivedEntry,
            "getArchivedProducts(type: 'variants') must list plainProduct (SKU-D archived, product still active)",
        );
        assert.strictEqual(
            (plainProductArchivedEntry as any).isProductArchived,
            false,
            "plainProduct itself must not be marked as archived - only its variant is",
        );
        assert.strictEqual(
            (plainProductArchivedEntry as any).archivedVariantsCount,
            2,
            "plainProduct has archived SKU-C (earlier round trip) and SKU-D (this switch) by now",
        );
        assert.ok(
            (plainProductArchivedEntry as any).archivedVariants.some(
                (v: any) => v.sku === `${TAG}-SKU-D`,
            ),
        );
        ok("getArchivedProducts(type: 'variants') lists products whose variant was archived while the product stays active");

        // ---- 7. deleting a whole product with order history must NOT throw ----
        const activeVariantB = product.variants[0];
        const cart = await AppDataSource.getRepository(Cart).save({
            userId: user.id,
        } as any);
        await AppDataSource.getRepository(CartItem).save({
            cart,
            product: { id: product.id },
            variant: { id: activeVariantB.id },
            variantId: activeVariantB.id,
            quantity: 1,
            price: 120,
            name: product.name,
            description: "",
        } as any);
        const wishlist = await AppDataSource.getRepository(Wishlist).save({
            userId: user.id,
        } as any);
        await AppDataSource.getRepository(WishlistItem).save({
            wishlist,
            productId: product.id,
            variantId: activeVariantB.id,
        } as any);
        ok("adds the product to a cart and a wishlist");

        await productService.deleteProductById(product.id, {
            vendorId: vendor.id,
        });
        ok("deleting a product with order history succeeds (no 409, no crash)");

        const archivedProduct = await AppDataSource.getRepository(
            Product,
        ).findOne({ where: { id: product.id }, withDeleted: true });
        assert.ok(
            archivedProduct?.deletedAt,
            "deleted product must be archived (deletedAt set), not gone from the DB",
        );
        ok("deleted product is archived, not hard-deleted");

        assert.strictEqual(
            await productService.getProductById(product.id, subcategory.id),
            null,
            "archived product must no longer be readable via the storefront",
        );
        ok("archived product is excluded from storefront reads");

        const remainingCartItems = await AppDataSource.getRepository(
            CartItem,
        ).count({ where: { product: { id: product.id } } });
        const remainingWishlistItems = await AppDataSource.getRepository(
            WishlistItem,
        ).count({ where: { productId: product.id } });
        assert.strictEqual(
            remainingCartItems,
            0,
            "cart items referencing the deleted product must be cleaned up",
        );
        assert.strictEqual(
            remainingWishlistItems,
            0,
            "wishlist items referencing the deleted product must be cleaned up",
        );
        ok("cart and wishlist entries for the deleted product are cleaned up");

        const orderAfterProductDelete = await orderService.getOrderDetails(
            order.id,
        );
        const survivingItem = orderAfterProductDelete.orderItems.find(
            (i: any) => i.productId === product.id,
        );
        assert.ok(
            (survivingItem as any)?.product,
            "existing order must still resolve the archived product's data",
        );
        assert.strictEqual((survivingItem as any).product.name, product.name);
        ok("existing order still shows the archived product's data (withDeleted)");

        // ---- 8a. ownership: a different vendor must not be able to delete
        // this (still-active) product ----
        const otherVendor = await AppDataSource.getRepository(Vendor).save({
            businessName: `${TAG}-intruder`,
            email: `${TAG}-intruder@example.com`,
            password: "not-a-real-hash",
            phoneNumber: "1111111111",
        } as any);
        await assert.rejects(
            () =>
                productService.deleteProductById(plainProduct.id, {
                    vendorId: otherVendor.id,
                }),
            /own products/i,
            "a vendor must not be able to delete another vendor's product",
        );
        await AppDataSource.getRepository(Vendor).delete({ id: otherVendor.id });
        ok("ownership is enforced - a different vendor cannot delete this product");

        // ---- 8b. deleting a product with NO order history must also just archive ----
        await productService.deleteProductById(plainProduct.id, {
            vendorId: vendor.id,
        });
        const archivedPlainProduct = await AppDataSource.getRepository(
            Product,
        ).findOne({ where: { id: plainProduct.id }, withDeleted: true });
        assert.ok(
            archivedPlainProduct?.deletedAt,
            "product with no order history must also be archived, not hard-deleted (single consistent path)",
        );
        ok("deleting a product with no order history also archives it");

        // ---- 8c. archived-products listing must show both deleted products
        // and be scoped to the requesting vendor ----
        const { products: archivedProductsList, total: archivedProductsTotal } =
            await productService.getArchivedProducts(
                { vendorId: vendor.id },
                1,
                20,
            );
        assert.ok(
            archivedProductsTotal >= 2 &&
                archivedProductsList.some((p) => p.id === product.id) &&
                archivedProductsList.some((p) => p.id === plainProduct.id),
            "getArchivedProducts must list both archived products for this vendor",
        );
        ok("getArchivedProducts lists archived products scoped to the vendor");

        const archivedProductEntry = archivedProductsList.find(
            (p) => p.id === product.id,
        ) as any;
        assert.strictEqual(archivedProductEntry.isProductArchived, true);
        assert.strictEqual(
            archivedProductEntry.thumbnail,
            `https://example.com/b.png`,
            "a variant product with no product-level images must fall back to a variant's image as its thumbnail",
        );
        ok("archived variant product's row falls back to a variant image for its thumbnail");

        const { products: typeProductOnly } =
            await productService.getArchivedProducts(
                { vendorId: vendor.id },
                1,
                20,
                undefined,
                "product",
            );
        assert.ok(
            typeProductOnly.every((p: any) => p.isProductArchived),
            "type: 'product' filter must only return whole-product archives",
        );
        const { products: searchResults } = await productService.getArchivedProducts(
            { vendorId: vendor.id },
            1,
            20,
            `${TAG} plain product`,
        );
        assert.ok(
            searchResults.length === 1 && searchResults[0].id === plainProduct.id,
            "search must filter archived products by name",
        );
        ok("getArchivedProducts type filter and search work");

        // ---- 9. restoring an archived product brings back the product and the
        // variants archived in that same delete (but not ones removed earlier) ----
        const restoredProduct = await productService.restoreProduct(
            product.id,
            { vendorId: vendor.id },
        );
        assert.strictEqual(
            restoredProduct.hasVariants,
            true,
            "restored product must keep its hasVariants flag",
        );
        assert.strictEqual(
            restoredProduct.variants.length,
            1,
            "restoring must bring back the variant archived in the same delete (SKU-B), not the earlier one (SKU-A)",
        );
        assert.strictEqual(restoredProduct.variants[0].sku, `${TAG}-SKU-B`);
        ok("restoring a product brings back the product and its same-operation variant, not earlier-archived ones");

        const visibleAfterRestore = await productService.getProductById(
            product.id,
            subcategory.id,
        );
        assert.ok(
            visibleAfterRestore,
            "restored product must be visible again via the storefront read",
        );
        ok("restored product reappears in storefront reads");

        // ---- 10. restoring a single archived variant independently of its product ----
        const stillArchivedA = await AppDataSource.getRepository(
            Variant,
        ).findOne({ where: { id: variantA.id }, withDeleted: true });
        assert.ok(
            stillArchivedA?.deletedAt,
            "SKU-A must still be archived before its explicit restore",
        );
        const restoredVariantA = await productService.restoreVariant(
            product.id,
            variantA.id,
            { vendorId: vendor.id },
        );
        assert.strictEqual(restoredVariantA.deletedAt, null);
        const activeAfterRestore = await AppDataSource.getRepository(
            Variant,
        ).findOne({ where: { id: variantA.id } });
        assert.ok(
            activeAfterRestore,
            "explicitly restored variant must now show up in an active-only read",
        );
        ok("restoring a single archived variant works independently of the product");

        // ---- 11. changing price/discount after an order must NOT change
        // that order's already-charged price (order.service.ts snapshots
        // price/name/sku/image onto OrderItem at purchase time) ----
        const orderItemBefore = await AppDataSource.getRepository(
            OrderItem,
        ).findOne({ where: { orderId: order.id, variantId: variantA.id } });
        assert.strictEqual(Number(orderItemBefore?.price), 100);

        await productService.updateProduct(
            vendor.id,
            true,
            product.id,
            {
                hasVariants: true,
                variants: [
                    {
                        id: variantA.id,
                        sku: variantA.sku,
                        basePrice: "999",
                        stock: "10",
                        variantImages: variantA.variantImages,
                    } as any,
                    {
                        id: restoredProduct.variants[0].id,
                        sku: restoredProduct.variants[0].sku,
                        basePrice: "999",
                        stock: "8",
                        variantImages: restoredProduct.variants[0].variantImages,
                    } as any,
                ],
            } as any,
            category.id,
            subcategory.id,
        );

        const variantAAfterPriceChange = await AppDataSource.getRepository(
            Variant,
        ).findOne({ where: { id: variantA.id } });
        assert.strictEqual(Number(variantAAfterPriceChange?.basePrice), 999);

        const orderItemAfter = await AppDataSource.getRepository(
            OrderItem,
        ).findOne({ where: { orderId: order.id, variantId: variantA.id } });
        assert.strictEqual(
            Number(orderItemAfter?.price),
            100,
            "order_items.price must stay frozen at 100 even after the variant's basePrice changes to 999",
        );

        const orderDetailsAfterPriceChange = await orderService.getOrderDetails(
            order.id,
        );
        const itemAfterPriceChange = orderDetailsAfterPriceChange.orderItems.find(
            (i: any) => i.variantId === variantA.id,
        );
        assert.strictEqual(
            Number((itemAfterPriceChange as any)?.price),
            100,
            "the order detail read must also show the frozen price, not the new variant price",
        );
        ok("changing a variant's price after an order does not alter that order's already-charged price");

        // ---- 12. restoring a variant onto a product that's currently
        // "normal" must make the variant visible again (flip hasVariants
        // back on + recompute stock), not leave it active-but-invisible ----
        let bugfixProduct = await productService.createProduct(
            {
                name: `${TAG} bugfix product`,
                hasVariants: true,
                variants: [
                    {
                        sku: `${TAG}-SKU-E`,
                        basePrice: "40",
                        stock: "6",
                        variantImages: ["https://example.com/e.png"],
                    } as any,
                ],
            } as any,
            category.id,
            subcategory.id,
            vendor.id,
        );
        const variantE = bugfixProduct.variants[0];
        bugfixProduct = await productService.updateProduct(
            vendor.id,
            true,
            bugfixProduct.id,
            {
                hasVariants: false,
                basePrice: "15",
                stock: "3",
                productImages: ["https://example.com/bugfix-normal.png"],
            } as any,
            category.id,
            subcategory.id,
        );
        assert.strictEqual(bugfixProduct.hasVariants, false);
        ok("switched bugfix product to normal, archiving its only variant");

        await productService.restoreVariant(bugfixProduct.id, variantE.id, {
            vendorId: vendor.id,
        });

        const bugfixProductAfterRestore = await AppDataSource.getRepository(
            Product,
        ).findOne({ where: { id: bugfixProduct.id }, relations: ["variants"] });
        assert.strictEqual(
            bugfixProductAfterRestore?.hasVariants,
            true,
            "restoring a variant must flip the product back to variant mode, or it stays invisible forever",
        );
        assert.strictEqual(bugfixProductAfterRestore?.basePrice, null);
        assert.strictEqual(bugfixProductAfterRestore?.stock, 6);
        assert.strictEqual(bugfixProductAfterRestore?.variants.length, 1);
        assert.strictEqual(bugfixProductAfterRestore?.variants[0].sku, `${TAG}-SKU-E`);

        const bugfixVisibleAfterRestore = await productService.getProductById(
            bugfixProduct.id,
            subcategory.id,
        );
        assert.strictEqual(bugfixVisibleAfterRestore?.hasVariants, true);
        assert.strictEqual(bugfixVisibleAfterRestore?.variants?.length, 1);
        ok("restoring a variant onto a 'normal' product flips it back to variant mode and the variant becomes visible");

        console.log("\nall checks passed");
    } finally {
        await cleanup();
        await AppDataSource.destroy();
    }
})().catch((error) => {
    console.error("\nFAILED:", error.message);
    process.exit(1);
});
