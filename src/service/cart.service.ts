import { hiddenProductIds } from "../search/catalog-visibility";
import { IsNull, Repository } from 'typeorm';
import { CartItem } from '../entities/cartItem.entity';
import { Cart } from '../entities/cart.entity';
import { Product } from '../entities/product.entity';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';
import { ICartAddRequest, ICartRemoveRequest } from '../interface/cart.interface';
import { Variant } from '../entities/variant.entity';
import { NotificationService } from './notification.service';
import { calculatePriceSnapshot, normalizeDiscountType, resolveFinalPrice } from '../utils/pricing.utils';
import { emitCartUpdate } from '../socket/socket';
import { DealStatus } from '../entities/deal.entity';
import { DiscountType } from '../entities/product.enum';
import { withAgeRestriction } from './age-restriction.service';

const CART_RELATIONS = [
    'items',
    'items.product',
    'items.product.subcategory',
    'items.product.subcategory.category',
    'items.product.deal',
    'items.variant',
];

/**
 * Service class for managing shopping cart operations.
 * Belongs to: Cart Module (Customer-side)
 */
export class CartService {
    private cartRepository: Repository<Cart>;
    private cartItemRepository: Repository<CartItem>;
    private productRepository: Repository<Product>;
    private variantRepository: Repository<Variant>;

    constructor() {
        this.cartRepository = AppDataSource.getRepository(Cart);
        this.cartItemRepository = AppDataSource.getRepository(CartItem);
        this.productRepository = AppDataSource.getRepository(Product);
        this.variantRepository = AppDataSource.getRepository(Variant);
    }

    private getDiscountValue(source: Product | Variant | null | undefined): number {
        if (!source) return 0;

        const discountType = normalizeDiscountType(source.discountType);
        if (discountType === DiscountType.FLAT) {
            return Number(source.discountAmount ?? source.discount ?? 0) || 0;
        }
        if (discountType === DiscountType.PERCENTAGE) {
            return Number(source.discountPercent ?? source.discount ?? 0) || 0;
        }
        return 0;
    }

    private buildCartItemPriceBreakdown(item: CartItem, unitPrice: number) {
        const product = item.product;
        const source = item.variant ?? product;
        const basePrice = Number(source?.basePrice ?? unitPrice) || unitPrice;
        const quantity = Number(item.quantity) || 0;
        const activeDeal =
            product?.deal && product.deal.status === DealStatus.ENABLED
                ? product.deal
                : null;

        const lineBaseTotal = Number((basePrice * quantity).toFixed(2));
        const lineTotal = Number((unitPrice * quantity).toFixed(2));
        let productDiscountUnit = 0;
        let dealDiscountUnit = 0;
        let productDiscountType = DiscountType.NONE;

        try {
            const snapshot = calculatePriceSnapshot({
                basePrice,
                discount: this.getDiscountValue(source),
                discountType: source?.discountType ?? DiscountType.NONE,
                dealDiscountPercentage: activeDeal?.discountPercentage ?? 0,
            });
            productDiscountUnit = snapshot.discountAmount;
            productDiscountType = snapshot.discountType;
            dealDiscountUnit = Math.max(
                0,
                basePrice - snapshot.discountAmount - unitPrice,
            );
        } catch {
            const savingsUnit = Math.max(0, basePrice - unitPrice);
            if (activeDeal) {
                dealDiscountUnit = savingsUnit;
            } else {
                productDiscountUnit = savingsUnit;
                productDiscountType = normalizeDiscountType(source?.discountType);
            }
        }

        const productDiscountTotal = Number(
            (productDiscountUnit * quantity).toFixed(2),
        );
        const dealDiscountTotal = Number(
            (dealDiscountUnit * quantity).toFixed(2),
        );

        return {
            basePrice,
            unitPrice,
            lineBaseTotal,
            lineTotal,
            productDiscount: {
                label: productDiscountType === DiscountType.NONE ? null : 'Discount',
                type: productDiscountType,
                amount: productDiscountTotal,
            },
            dealDiscount: {
                label: activeDeal?.name ?? null,
                percent: activeDeal
                    ? Number(activeDeal.discountPercentage) || null
                    : null,
                amount: dealDiscountTotal,
            },
            savingsTotal: Number(
                (productDiscountTotal + dealDiscountTotal).toFixed(2),
            ),
        };
    }

    /**
     * Adds a product to the user's cart.
     *
     * - Validates product and stock.
     * - Applies discounts and updates existing quantity if already in cart.
     * - Initializes cart if not created.
     *
     * @param userId {number} - ID of the user
     * @param data {ICartAddRequest} - Contains productId and quantity
     * @returns The updated cart, in the same shape as `getCart`
     * @throws {APIError} - On validation, stock, or DB errors
     * @access Customer
     */

    async addToCart(userId: number, data: ICartAddRequest) {
        const { productId, quantity, variantId } = data;

        // A product whose vendor is no longer approved is off the shelf.
        if ((await hiddenProductIds(AppDataSource.manager, [productId])).length) {
            throw new APIError(404, 'Product not found');
        }

        // Validate product
        const product = await this.productRepository.findOne({
            where: { id: productId },
            relations: ['deal'],
        });
        if (!product) throw new APIError(404, 'Product not found');

        let price: number;
        let name: string = product.name;
        let description: string = product.description || '';
        let image: string | null = product.productImages?.[0] ?? null;
        let stock: number;

        // Handle variant product
        if (variantId) {
            const variant = await this.variantRepository.findOne({
                where: { id: variantId, productId },
            });
            if (!variant) throw new APIError(404, 'Variant not found');
            if (variant.status === 'OUT_OF_STOCK'  || variant.stock < quantity) {
                throw new APIError(400, `Cannot add ${quantity} items; only ${variant.stock} available for this variant`);
            }
            stock = variant.stock;

            // Trust the variant's persisted finalPrice (deal-inclusive) over
            // recomputing from discount/discountType — a variant with an
            // active Deal has its own discount fields zeroed out at save
            // time, so recomputing here would silently ignore the Deal and
            // show a too-high price (diverging from checkout's real total).
            price = resolveFinalPrice({
                finalPrice: variant.finalPrice,
                basePrice: variant.basePrice,
                discountAmount: variant.discountAmount,
            });
            if (variant.attributes?.name) name = `${product.name} - ${variant.attributes.name}`;
            if (variant.variantImages?.length) image = variant.variantImages[0];
        } else {
            // Handle non-variant product
            if (product.hasVariants) {
                throw new APIError(400, 'Please select a variant before proceeding.');
            }
            if (!product.basePrice || product.stock === undefined) {
                throw new APIError(400, 'Product must have basePrice and stock');
            }

            if (product.stock < quantity) {
                throw new APIError(400, `Cannot add ${quantity} items; only ${product.stock} available`);
            }
            stock = product.stock;

            price = resolveFinalPrice({
                finalPrice: product.finalPrice,
                basePrice: product.basePrice,
                discountAmount: product.discountAmount,
            });
        }

        const cart = await this.getOrCreateCart(userId);

        // The existing line is looked up directly rather than out of a loaded
        // cart, and its quantity moves in one guarded UPDATE: two quick adds can
        // no longer read the same quantity and both write theirs back, and the
        // stock ceiling is checked against the row as it is at write time.
        const existing = await this.cartItemRepository.findOne({
            where: {
                cart: { id: cart.id },
                product: { id: productId },
                variantId: variantId ? variantId : IsNull(),
            },
        });

        if (existing) {
            const result = await this.cartItemRepository
                .createQueryBuilder()
                .update(CartItem)
                .set({
                    quantity: () => '"quantity" + :quantity',
                    price,
                    name,
                    description,
                    image,
                })
                .where('id = :id AND "quantity" + :quantity <= :stock', {
                    id: existing.id,
                    quantity,
                    stock,
                })
                .execute();
            if (!result.affected) {
                throw new APIError(400, `Cannot add ${existing.quantity + quantity} items; only ${stock} available`);
            }
        } else {
            await this.cartItemRepository.insert({
                cart: { id: cart.id },
                product: { id: productId },
                quantity,
                price,
                name,
                description,
                image,
                // Both columns: `variantId` is what lines are matched on,
                // `variant_id` is the relation the cart is read through.
                variantId: variantId || null,
                variant: variantId ? { id: variantId } : null,
            });
        }

        // Push notification (fire-and-forget). Not for Buy Now: that path goes
        // straight to checkout and never shows a cart, so "added to cart" is a
        // notification about something the customer did not do.
        if (data.source !== "buy_now") {
            new NotificationService().notifyAddToCart(userId, name).catch(() => {});
        }

        return this.getCart(userId);
    }


    /**
     * Removes an item from the cart or reduces its quantity by 1.
     *
     * - If `decreaseOnly` is true and quantity > 1, only decreases.
     * - If quantity == 1 or decreaseOnly is false, item is removed entirely.
     *
     * Removal never depends on the product or variant still existing: a line
     * whose variant was archived is exactly the one a shopper needs to delete.
     *
     * @param userId {number} - ID of the user
     * @param data {ICartRemoveRequest} - Contains cartItemId and optional decreaseOnly flag
     * @returns The updated cart, in the same shape as `getCart`
     * @throws {APIError} - If the item is not in this user's cart
     * @access Customer
     */
    async removeFromCart(userId: number, data: ICartRemoveRequest) {
        const { cartItemId } = data;
        const decreaseOnly = Boolean(data.decreaseOnly);

        // Scoped to the caller's cart, so one shopper cannot touch another's line.
        const cartItem = await this.cartItemRepository.findOne({
            where: { id: cartItemId, cart: { userId } },
        });
        if (!cartItem) throw new APIError(404, 'Cart item not found');

        const decreased = decreaseOnly
            ? await this.cartItemRepository
                  .createQueryBuilder()
                  .update(CartItem)
                  .set({ quantity: () => '"quantity" - 1' })
                  .where('id = :id AND "quantity" > 1', { id: cartItemId })
                  .execute()
            : null;

        if (!decreased?.affected) {
            await this.cartItemRepository.delete(cartItemId);
        }

        return this.getCart(userId);
    }

    /**
     * Retrieves the user's current cart.
     *
     * One query: the product, variant, deal and category every line needs are
     * joined in rather than fetched per line — per-line lookups ran in parallel
     * and took a pool connection each, so one large cart could hold the whole
     * pool. Lines come back oldest first, so a quantity change never moves one.
     *
     * @param userId {number} - ID of the user
     * @returns The cart with items, live stock warnings and price breakdowns
     * @access Customer
     */
    async getCart(userId: number) {
        const cart = await this.cartRepository.findOne({
            where: { userId },
            relations: CART_RELATIONS,
            order: { items: { id: 'ASC' } },
        });

        if (!cart) {
            // Create an empty cart if none exists
            return await this.getOrCreateCart(userId);
        }

        // A cart item's price is a snapshot taken at add-to-cart time — if the
        // product/variant's discount or an admin Deal changes afterward (or
        // the original add-time computation was wrong, e.g. a Deal being
        // dropped by an outdated calculation), the cart would keep showing a
        // stale price forever. Since stock is already re-checked live here
        // per item, re-resolve the current authoritative price at the same
        // time and self-heal the stored snapshot so the cart never drifts
        // from what checkout will actually charge.
        const priceChanges: { id: number; price: number }[] = [];

        const cartItemsWithWarnings = cart.items.map((item) => {
            let warningMessage: string | undefined;
            let currentPrice = Number(item.price);
            const product = item.product;

            if (item.variantId) {
                const variant = item.variant;
                if (!variant) {
                    warningMessage = 'Associated variant no longer exists';
                } else {
                    if (variant.status === 'OUT_OF_STOCK') {
                        warningMessage = 'Variant is not available';
                    } else if (item.quantity > variant.stock) {
                        warningMessage = `Only ${variant.stock} units available for this variant. You have ${item.quantity} in your cart.`;
                    }
                    currentPrice = resolveFinalPrice({
                        finalPrice: variant.finalPrice,
                        basePrice: variant.basePrice,
                        discountAmount: variant.discountAmount,
                    });
                }
            } else if (!product) {
                warningMessage = 'Associated product no longer exists';
            } else {
                if (product.hasVariants) {
                    warningMessage = 'Product requires a variant but none is selected';
                } else if (product.status === 'OUT_OF_STOCK') {
                    warningMessage = 'Product is not available';
                } else if (item.quantity > (product.stock ?? 0)) {
                    warningMessage = `Only ${product.stock} units available. You have ${item.quantity} in your cart.`;
                }
                currentPrice = resolveFinalPrice({
                    finalPrice: product.finalPrice,
                    basePrice: product.basePrice,
                    discountAmount: product.discountAmount,
                });
            }

            if (currentPrice !== Number(item.price)) {
                priceChanges.push({ id: item.id, price: currentPrice });
            }

            return {
                ...item,
                product: product ? withAgeRestriction(product) : product,
                price: currentPrice,
                priceBreakdown: this.buildCartItemPriceBreakdown(item, currentPrice),
                warningMessage,
            };
        });

        const total = cartItemsWithWarnings.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
        );

        // Sequential on purpose: these are rare self-heals, and running them in
        // parallel would take a pool connection each.
        for (const change of priceChanges) {
            await this.cartItemRepository.update(change.id, { price: change.price });
        }
        if (total !== Number(cart.total)) {
            await this.cartRepository.update(cart.id, { total });
        }

        return {
            ...cart,
            total,
            items: cartItemsWithWarnings,
        };
    }

    private async getOrCreateCart(userId: number): Promise<Cart> {
        const cart = await this.cartRepository.findOne({ where: { userId } });
        if (cart) return cart;
        return this.cartRepository.save(this.cartRepository.create({ userId, total: 0, items: [] }));
    }

    /**
     * Clears all items from the user's cart.
     *
     * @param userId {number} - ID of the user
     * @returns {Promise<void>}
     * @throws {APIError} - If cart not found
     * @access Customer
     */
    async clearCart(userId: number): Promise<void> {
        const cart = await this.cartRepository.findOne({ where: { userId } });

        if (!cart) throw new APIError(404, 'Cart not found');

        await this.cartItemRepository.delete({ cart: { id: cart.id } });
        await this.cartRepository.update(cart.id, { total: 0 });
        cart.total = 0;
        cart.items = [];

        // Order-success paths (COD/eSewa/NPX) all clear the cart server-side
        // via this method but don't otherwise touch the socket — without this,
        // the cart badge stays stale until the user navigates to /cart or
        // reloads. Push it live instead.
        emitCartUpdate(userId, cart);
    }

}
