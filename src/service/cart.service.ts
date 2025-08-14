import { Repository } from 'typeorm';
import { CartItem } from '../entities/cartItem.entity';
import { Cart } from '../entities/cart.entity';
import { Product } from '../entities/product.entity';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';
import { ICartAddRequest, ICartRemoveRequest } from '../interface/cart.interface';
import { DiscountType } from '../entities/product.enum';

/**
 * Service class for managing shopping cart operations.
 * Belongs to: Cart Module (Customer-side)
 */
export class CartService {
    private cartRepository: Repository<Cart>;
    private cartItemRepository: Repository<CartItem>;
    private productRepository: Repository<Product>;

    constructor() {
        this.cartRepository = AppDataSource.getRepository(Cart);
        this.cartItemRepository = AppDataSource.getRepository(CartItem);
        this.productRepository = AppDataSource.getRepository(Product);
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
        const { productId, quantity } = data;

        // Validate product
        const product = await this.productRepository.findOne({
            where: { id: productId },
        });
        if (!product) throw new APIError(404, 'Product not found');

        // Handle non-variant product
        if (!product.basePrice || product.stock === undefined) {
            throw new APIError(400, 'Product must have basePrice and stock');
        }
        if (product.stock < quantity) throw new APIError(400, 'Insufficient stock');

        const price = this.calculateDiscountedPrice(
            product.basePrice,
            product.discount || 0,
            product.discountType || DiscountType.PERCENTAGE
        );
        const name = product.name;
        const description = product.description || '';
        const image = product.productImages?.[0] ?? null;

        // Get or create cart
        let cart = await this.cartRepository.findOne({
            where: { userId },
            relations: ['items', 'items.product'],
        });

        if (!cart) {
            cart = this.cartRepository.create({ userId, total: 0, items: [] });
            cart = await this.cartRepository.save(cart);
        }

        // Check if product already in cart
        let cartItem = cart.items.find(item => item.product.id === productId);

        if (cartItem) {
            // Update quantity if already in cart
            cartItem.quantity += quantity;
            if (cartItem.quantity > product.stock) {
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
        const { cartItemId, decreaseOnly = false } = data;

        const cart = await this.cartRepository.findOne({
            where: { userId },
            relations: ['items'],
        });

        if (!cart) throw new APIError(404, 'Cart not found');

        const cartItem = cart.items.find(item => item.id === cartItemId);
        if (!cartItem) throw new APIError(404, 'Cart item not found');

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
            relations: ['items', 'items.product']
        });

        if (!cart) throw new APIError(404, 'Cart is empty');

        const cartItemsWithWarnings = cart.items.map(item => {
            let warningMessage: string | undefined;
            const stock = item.product.stock ?? 0;

            if (item.quantity > stock) {
                warningMessage = `Only ${stock} units available. You have ${item.quantity} in your cart.`;
            }

            return {
                ...item,
                warningMessage,
            };
        });

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