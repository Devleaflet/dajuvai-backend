import { Repository } from 'typeorm';
import { CartItem } from '../entities/cartItem.entity';
import { Cart } from '../entities/cart.entity';
import { Product } from '../entities/product.entity';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';
import { ICartAddRequest, ICartRemoveRequest } from '../interface/cart.interface';
import { DiscountType, InventoryStatus } from '../entities/product.enum';
import { Variant } from '../entities/variant.entity';

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

        console.log("---------------Variant id -----------------")
        console.log(variantId);

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
                where: { id: variantId.toString(), productId: productId.toString() },
            });
            if (!variant) throw new APIError(404, 'Variant not found');
            console.log("---------------Variant------------------")
            console.log(variant)
            if (variant.status === 'OUT_OF_STOCK'  || variant.stock < quantity) {
                throw new APIError(400, `Cannot add ${quantity} items; only ${variant.stock} available for this variant`);
            }

            price = this.calculateDiscountedPrice(variant.basePrice, variant.discount || 0, variant.discountType || DiscountType.PERCENTAGE);
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

            price = this.calculateDiscountedPrice(product.basePrice, product.discount || 0, product.discountType || DiscountType.PERCENTAGE);
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
                const variant = await this.variantRepository.findOne({ where: { id: variantId.toString() } });
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
                variant: variantId ? await this.variantRepository.findOne({ where: { id: variantId.toString() } }) : undefined,
            });
            await this.cartItemRepository.save(cartItem);
            cart.items.push(cartItem);
        }

        // Update cart total
        cart.total = cart.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        return await this.cartRepository.save(cart);
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

        console.log("---------------------Decrease only ---------------------")
        console.log(decreaseOnly)
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
            const variant = await this.variantRepository.findOne({ where: { id: cartItem.variantId.toString() } });
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

        const cartItemsWithWarnings = await Promise.all(
            cart.items.map(async (item) => {
                let warningMessage: string | undefined;

                if (item.variantId) {
                    // Check variant stock
                    const variant = await this.variantRepository.findOne({ where: { id: item.variantId.toString() } });
                    if (!variant) {
                        warningMessage = 'Associated variant no longer exists';
                    } else if (variant.status !== 'AVAILABLE') {
                        warningMessage = 'Variant is not available';
                    } else if (item.quantity > variant.stock) {
                        warningMessage = `Only ${variant.stock} units available for this variant. You have ${item.quantity} in your cart.`;
                    }
                } else {
                    // Check product stock
                    const product = await this.productRepository.findOne({ where: { id: item.product.id } });
                    if (!product) {
                        warningMessage = 'Associated product no longer exists';
                    } else if (product.hasVariants) {
                        warningMessage = 'Product requires a variant but none is selected';
                    } else if (product.status !== 'AVAILABLE') {
                        warningMessage = 'Product is not available';
                    } else if (item.quantity > (product.stock ?? 0)) {
                        warningMessage = `Only ${product.stock} units available. You have ${item.quantity} in your cart.`;
                    }
                }

                return {
                    ...item,
                    warningMessage,
                };
            })
        );

        return {
            ...cart,
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
    }

    /**
     * Calculates the price of a product after applying discount.
     *
     * @param basePrice {number} - Original product price
     * @param discount {number} - Discount value
     * @param discountType {string} - Discount type (PERCENTAGE or FLAT)
     * @returns {number} - Final price after discount (rounded to 2 decimals)
     * @access Internal
     */
    private calculateDiscountedPrice(basePrice: number, discount: number, discountType: string): number {
        let finalPrice = basePrice;

        if (discountType === DiscountType.PERCENTAGE) {
            finalPrice = basePrice - (basePrice * discount / 100);
        } else if (discountType === DiscountType.FLAT) {
            finalPrice = Math.max(0, basePrice - discount);
        }

        return Math.round(finalPrice * 100) / 100;
    }
}