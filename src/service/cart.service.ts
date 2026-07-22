import { Repository } from 'typeorm';
import { CartItem } from '../entities/cartItem.entity';
import { Cart } from '../entities/cart.entity';
import { Product } from '../entities/product.entity';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';
import { ICartAddRequest, ICartRemoveRequest } from '../interface/cart.interface';
import { Variant } from '../entities/variant.entity';
import { NotificationService } from './notification.service';
import { resolveFinalPrice } from '../utils/pricing.utils';
import { emitCartUpdate } from '../socket/socket';

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

    /**
     * Adds a product to the user's cart.
     *
     * - Validates product and stock.
     * - Applies discounts and updates existing quantity if already in cart.
     * - Initializes cart if not created.
     *
     * @param userId {number} - ID of the user
     * @param data {ICartAddRequest} - Contains productId and quantity
     * @returns {Promise<Cart>} - The updated cart
     * @throws {APIError} - On validation, stock, or DB errors
     * @access Customer
     */

    async addToCart(userId: number, data: ICartAddRequest): Promise<Cart> {
        const { productId, quantity, variantId } = data;

        // Validate product
        const product = await this.productRepository.findOne({
            where: { id: productId },
            relations: ['variants'],
        });
        if (!product) throw new APIError(404, 'Product not found');

        let price: number;
        let name: string = product.name;
        let description: string = product.description || '';
        let image: string | null = product.productImages?.[0] ?? null;
        let cartItem: CartItem;

        // Handle variant product
        if (variantId) {
            const variant = await this.variantRepository.findOne({
                where: { id: variantId, productId },
            });
            if (!variant) throw new APIError(404, 'Variant not found');
            if (variant.status === 'OUT_OF_STOCK'  || variant.stock < quantity) {
                throw new APIError(400, `Cannot add ${quantity} items; only ${variant.stock} available for this variant`);
            }

            // Trust the variant's persisted finalPrice (deal-inclusive) over
            // recomputing from discount/discountType — a variant with an
            // active Deal has its own discount fields zeroed out at save
            // time, so recomputing here would silently ignore the Deal and
            // show a too-high price (diverging from checkout's real total).
            price = resolveFinalPrice({
                finalPrice: variant.finalPrice,
                basePrice: variant.basePrice,
                discount: variant.discount,
                discountType: variant.discountType,
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

            price = resolveFinalPrice({
                finalPrice: product.finalPrice,
                basePrice: product.basePrice,
                discount: product.discount,
                discountType: product.discountType,
            });
        }

        // Get or create cart
        let cart = await this.cartRepository.findOne({
            where: { userId },
            relations: ['items', 'items.product', 'items.variant'],
        });

        if (!cart) {
            cart = this.cartRepository.create({ userId, total: 0, items: [] });
            cart = await this.cartRepository.save(cart);
        }

        // Check if product or variant already in cart
        cartItem = cart.items.find(item =>
            item.product.id === productId &&
            (variantId ? item.variantId === variantId : !item.variantId)
        );

        if (cartItem) {
            // Update quantity if already in cart
            cartItem.quantity += quantity;
            if (variantId) {
                const variant = await this.variantRepository.findOne({ where: { id: variantId } });
                if (variant && cartItem.quantity > variant.stock) {
                    throw new APIError(400, `Cannot add ${cartItem.quantity} items; only ${variant.stock} available`);
                }
            } else if (cartItem.quantity > product.stock!) {
                throw new APIError(400, `Cannot add ${cartItem.quantity} items; only ${product.stock} available`);
            }
            cartItem.price = price;
            cartItem.name = name;
            cartItem.description = description;
            cartItem.image = image;
            await this.cartItemRepository.save(cartItem);
        } else {
            // Create new cart item
            cartItem = this.cartItemRepository.create({
                cart,
                product,
                quantity,
                price,
                name,
                description,
                image,
                variantId: variantId || null,
                variant: variantId ? await this.variantRepository.findOne({ where: { id: variantId } }) : undefined,
            });
            await this.cartItemRepository.save(cartItem);
            cart.items.push(cartItem);
        }

        // Update cart total
        cart.total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const savedCart = await this.cartRepository.save(cart);

        // Push notification (fire-and-forget)
        new NotificationService().notifyAddToCart(userId, name).catch(() => {});

        return savedCart;
    }


    /**
     * Removes an item from the cart or reduces its quantity by 1.
     *
     * - If `decreaseOnly` is true and quantity > 1, only decreases.
     * - If quantity == 1 or decreaseOnly is false, item is removed entirely.
     *
     * @param userId {number} - ID of the user
     * @param data {ICartRemoveRequest} - Contains cartItemId and optional decreaseOnly flag
     * @returns {Promise<Cart>} - Updated cart after modification
     * @throws {APIError} - If cart/item not found
     * @access Customer
     */
    async removeFromCart(userId: number, data: ICartRemoveRequest): Promise<Cart> {
        let { cartItemId, decreaseOnly } = data;

        decreaseOnly = Boolean(decreaseOnly);

        // Fetch cart with items and their product and variant relations
        const cart = await this.cartRepository.findOne({
            where: { userId },
            relations: ['items', 'items.product', 'items.variant'],
        });

        if (!cart) throw new APIError(404, 'Cart not found');

        // Find the cart item
        const cartItem = cart.items.find(item => item.id === cartItemId);
        if (!cartItem) throw new APIError(404, 'Cart item not found');

        // Validate stock for the associated product or variant
        if (cartItem.variantId) {
            const variant = await this.variantRepository.findOne({ where: { id: cartItem.variantId } });
            if (!variant) throw new APIError(404, 'Associated variant not found');
        } else {
            const product = await this.productRepository.findOne({ where: { id: cartItem.product.id } });
            if (!product) throw new APIError(404, 'Associated product not found');
            if (product.hasVariants) throw new APIError(400, 'Cart item references a product that requires a variant');
        }

        // Handle decrease or remove
        if (decreaseOnly && cartItem.quantity > 1) {
            cartItem.quantity -= 1;
            await this.cartItemRepository.save(cartItem);
        } else {
            await this.cartItemRepository.delete(cartItemId);
            cart.items = cart.items.filter(item => item.id !== cartItemId);
        }

        // Update cart total
        cart.total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        return await this.cartRepository.save(cart);
    }

    /**
     * Retrieves the user's current cart.
     *
     * @param userId {number} - ID of the user
     * @returns {Promise<Cart>} - The cart with items and related product/vendor info
     * @throws {APIError} - If cart not found
     * @access Customer
     */
    async getCart(userId: number): Promise<Cart> {
        const cart = await this.cartRepository.findOne({
            where: { userId },
            relations: ['items', 'items.product', 'items.variant'],
        });

        if (!cart) {
            // Create an empty cart if none exists
            const newCart = this.cartRepository.create({ userId, total: 0, items: [] });
            return await this.cartRepository.save(newCart);
        }

        // A cart item's price is a snapshot taken at add-to-cart time — if the
        // product/variant's discount or an admin Deal changes afterward (or
        // the original add-time computation was wrong, e.g. a Deal being
        // dropped by an outdated calculation), the cart would keep showing a
        // stale price forever. Since stock is already re-checked live here
        // per item, re-resolve the current authoritative price at the same
        // time and self-heal the stored snapshot so the cart never drifts
        // from what checkout will actually charge.
        const itemsToPersist: CartItem[] = [];

        const cartItemsWithWarnings = await Promise.all(
            cart.items.map(async (item) => {
                let warningMessage: string | undefined;
                let currentPrice = Number(item.price);

                if (item.variantId) {
                    // Check variant stock
                    const variant = await this.variantRepository.findOne({ where: { id: item.variantId } });
                    if (!variant) {
                        warningMessage = 'Associated variant no longer exists';
                    } else {
                        if (variant.status !== 'AVAILABLE') {
                            warningMessage = 'Variant is not available';
                        } else if (item.quantity > variant.stock) {
                            warningMessage = `Only ${variant.stock} units available for this variant. You have ${item.quantity} in your cart.`;
                        }
                        currentPrice = resolveFinalPrice({
                            finalPrice: variant.finalPrice,
                            basePrice: variant.basePrice,
                            discount: variant.discount,
                            discountType: variant.discountType,
                        });
                    }
                } else {
                    // Check product stock
                    const product = await this.productRepository.findOne({ where: { id: item.product.id } });
                    if (!product) {
                        warningMessage = 'Associated product no longer exists';
                    } else {
                        if (product.hasVariants) {
                            warningMessage = 'Product requires a variant but none is selected';
                        } else if (product.status !== 'AVAILABLE') {
                            warningMessage = 'Product is not available';
                        } else if (item.quantity > (product.stock ?? 0)) {
                            warningMessage = `Only ${product.stock} units available. You have ${item.quantity} in your cart.`;
                        }
                        currentPrice = resolveFinalPrice({
                            finalPrice: product.finalPrice,
                            basePrice: product.basePrice,
                            discount: product.discount,
                            discountType: product.discountType,
                        });
                    }
                }

                if (currentPrice !== Number(item.price)) {
                    item.price = currentPrice;
                    itemsToPersist.push(item);
                }

                return {
                    ...item,
                    price: currentPrice,
                    warningMessage,
                };
            })
        );

        const total = cartItemsWithWarnings.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0,
        );

        if (itemsToPersist.length || total !== Number(cart.total)) {
            await Promise.all([
                itemsToPersist.length
                    ? this.cartItemRepository.save(itemsToPersist)
                    : Promise.resolve(),
                this.cartRepository.update(cart.id, { total }),
            ]);
        }

        return {
            ...cart,
            total,
            items: cartItemsWithWarnings,
        };
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
        const cart = await this.cartRepository.findOne({
            where: { userId },
            relations: ['items'],
        });

        if (!cart) throw new APIError(404, 'Cart not found');

        // Delete all items from DB
        if (cart.items.length > 0) {
            const cartItemIds = cart.items.map(item => item.id);
            await this.cartItemRepository.delete(cartItemIds);
        }

        // Reset cart metadata
        cart.total = 0;
        cart.items = [];

        await this.cartRepository.save(cart);

        // Order-success paths (COD/eSewa/NPX) all clear the cart server-side
        // via this method but don't otherwise touch the socket — without this,
        // the cart badge stays stale until the user navigates to /cart or
        // reloads. Push it live instead.
        emitCartUpdate(userId, cart);
    }

}
