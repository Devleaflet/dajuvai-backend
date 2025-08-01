import { Repository } from 'typeorm';
import { CartItem } from '../entities/cartItem.entity';
import { Cart } from '../entities/cart.entity';
import { Product } from '../entities/product.entity';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';
import { ICartAddRequest, ICartRemoveRequest } from '../interface/cart.interface';
import { DiscountType } from '../entities/product.enum';
import { ProductVariant } from '../entities/productVariant.entity';

/**
 * Service class for managing shopping cart operations.
 * Belongs to: Cart Module (Customer-side)
 */
export class CartService {
    private cartRepository: Repository<Cart>;
    private cartItemRepository: Repository<CartItem>;
    private productRepository: Repository<Product>;
    private variantRepository: Repository<ProductVariant>;

    constructor() {
        this.cartRepository = AppDataSource.getRepository(Cart);
        this.cartItemRepository = AppDataSource.getRepository(CartItem);
        this.productRepository = AppDataSource.getRepository(Product);
        this.variantRepository = AppDataSource.getRepository(ProductVariant);
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
        const { productId, variantId, quantity } = data;

        // Validate product
        const product = await this.productRepository.findOne({
            where: { id: productId },
            relations: ['productImages', 'variants', 'variants.images'],
        });
        if (!product) throw new APIError(404, 'Product not found');

        let price: number;
        let stock: number;
        let name: string;
        let description: string;
        let image: string | null;

        if (product.hasVariants && !variantId) {
            throw new APIError(400, 'Variant ID is required for products with variants');
        }

        if (product.hasVariants && variantId) {
            // Handle variant product
            const variant = await this.variantRepository.findOne({
                where: { id: variantId, product: { id: productId } },
                relations: ['images'],
            });
            if (!variant) throw new APIError(404, 'Product variant not found');
            if (variant.stock < quantity) throw new APIError(400, 'Insufficient stock for variant');

            price = variant.price;
            stock = variant.stock;
            name = `${product.name} (${variant.sku})`;
            description = product.description;
            image = variant.images?.[0]?.imageUrl ?? product.productImages?.[0]?.imageUrl ?? null;
        } else {
            // Handle non-variant product
            if (!product.basePrice || product.stock === undefined) {
                throw new APIError(400, 'Non-variant product must have basePrice and stock');
            }
            if (product.stock < quantity) throw new APIError(400, 'Insufficient stock');

            price = this.calculateDiscountedPrice(
                product.basePrice,
                product.discount || 0,
                product.discountType || DiscountType.PERCENTAGE
            );
            stock = product.stock;
            name = product.name;
            description = product.description;
            image = product.productImages?.[0]?.imageUrl ?? null;
        }

        // Get or create cart
        let cart = await this.cartRepository.findOne({
            where: { userId },
            relations: ['items', 'items.product'],
        });

        if (!cart) {
            cart = this.cartRepository.create({ userId, total: 0, items: [] });
            cart = await this.cartRepository.save(cart);
        }

        // Check if product/variant already in cart
        let cartItem = cart.items.find(item =>
            item.product.id === productId &&
            (variantId ? item.variantId === variantId : !item.variantId)
        );

        if (cartItem) {
            // Update quantity if already in cart
            cartItem.quantity += quantity;
            if (cartItem.quantity > stock) {
                throw new APIError(400, `Cannot add ${cartItem.quantity} items; only ${stock} available`);
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
                variantId: variantId || null,
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
            relations: [
                'items',
                'items.product',
                'items.product.vendor',
                'items.product.variants',
                'items.product.productImages'
            ]
        });

        if (!cart) throw new APIError(404, 'Cart is empty');

        const cartItemWithWarnings = cart.items.map(item => {
            let warningMessage: string | undefined;
            let stock: number;

            if (item.variantId) {
                const variant = item.product.variants?.find(v => v.id === item.variantId);
                stock = variant?.stock ?? 0;
            } else {
                stock = item.product.stock ?? 0;
            }

            if (item.quantity > stock) {
                warningMessage = `Only ${stock} units available. You have ${item.quantity} in your cart.`;
            }

            return {
                ...item,
                warningMessage,
            };
        })
        return {
            ...cart,
            items: cartItemWithWarnings,
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
