import { Repository } from 'typeorm';
import { Wishlist } from '../entities/wishlist.entity';
import { WishlistItem } from '../entities/wishlistItem.entity';
import { Product } from '../entities/product.entity';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';
import { IWishlistAddRequest, IWishlistRemoveRequest, IWishlistMoveToCartRequest } from '../interface/wishlist.interface';
import { CartService } from './cart.service';
import { Variant } from '../entities/variant.entity';

/**
 * Service for managing wishlist-related operations such as
 * adding/removing items, fetching the wishlist, and moving items to cart.
 */
export class WishlistService {
    // Repository to manage Wishlist entities in the database
    private wishlistRepository: Repository<Wishlist>;

    // Repository to manage WishlistItem entities in the database
    private wishlistItemRepository: Repository<WishlistItem>;

    // Repository to manage Product entities in the database
    private productRepository: Repository<Product>;

    // Service to handle cart-related operations (used to move items from wishlist to cart)
    private cartService: CartService;

    /**
     * Initializes repositories for Wishlist, WishlistItem, Product entities
     * and instantiates the CartService dependency.
     */
    constructor() {
        // Get the repository instance for Wishlist from TypeORM data source
        this.wishlistRepository = AppDataSource.getRepository(Wishlist);

        // Get the repository instance for WishlistItem from TypeORM data source
        this.wishlistItemRepository = AppDataSource.getRepository(WishlistItem);

        // Get the repository instance for Product from TypeORM data source
        this.productRepository = AppDataSource.getRepository(Product);

        // Create a new CartService instance to handle cart operations
        this.cartService = new CartService();
    }


    /**
     * Adds a product to the user's wishlist.
     * Uses a transaction to ensure consistency.
     * @param userId - ID of the user
     * @param data - Contains the productId to add
     * @returns Promise<Wishlist> - The updated wishlist including the new item
     * @throws APIError if the product doesn't exist or is already in the wishlist
     */
    async addToWishlist(userId: number, data: IWishlistAddRequest): Promise<Wishlist> {
        const { productId, variantId } = data;

        return await AppDataSource.transaction(async (manager) => {
            const productRepository = manager.getRepository(Product);
            const variantRepository = manager.getRepository(Variant);
            const wishlistRepository = manager.getRepository(Wishlist);
            const wishlistItemRepository = manager.getRepository(WishlistItem);

            // Verify product exists before adding
            const product = await productRepository.findOne({ where: { id: productId } });
            if (!product) {
                throw new APIError(404, 'Product not found');
            }

            // if variant provided
            let variant: Variant;

            if (variantId) {
                variant = await variantRepository.findOne({
                    where: {
                        id: variantId.toString(), productId: productId.toString()
                    }
                })

                if (!variant) {
                    throw new APIError(404, "Variant not found")
                }
            }


            // Find existing wishlist or create a new one if none exists
            let wishlist = await wishlistRepository.findOne({
                where: { userId },
                relations: ['items', 'items.product', 'items.variant'],
            });

            if (!wishlist) {
                wishlist = wishlistRepository.create({
                    userId,
                    items: [],
                });
                await wishlistRepository.save(wishlist);
            }

            // Check if product is already in wishlist to prevent duplicates
            const exists = wishlist.items.some((item) => item.productId === productId && item.variantId === (variantId || null));
            if (exists) {
                throw new APIError(400, 'Product already in wishlist');
            }

            // Create wishlist item and associate with wishlist and product
            const wishlistItem = wishlistItemRepository.create({
                wishlist,
                product,
                productId,
                variant: variant || null,
                variantId: variantId || null
            });
            await wishlistItemRepository.save(wishlistItem);

            // Reload wishlist to get updated items relation
            wishlist = await wishlistRepository.findOne({
                where: { id: wishlist.id },
                relations: ['items', 'items.product', 'items.variant'],
            });

            return wishlist!;
        });
    }



    /**
     * Removes a wishlist item from the user's wishlist.
     * Ensures valid ID and item existence before deletion.
     * @param userId - ID of the user
     * @param data - Contains wishlistItemId to remove
     * @returns Promise<Wishlist> - Updated wishlist without the removed item
     * @throws APIError if wishlist or item not found, or invalid ID
     */
    async removeFromWishlist(
        userId: number,
        data: IWishlistRemoveRequest
    ): Promise<Wishlist> {
        const { wishlistItemId } = data;

        // Validate wishlistItemId
        if (!wishlistItemId || isNaN(wishlistItemId) || wishlistItemId <= 0) {
            throw new APIError(400, 'Valid Wishlist Item ID is required');
        }

        return await AppDataSource.transaction(async (manager) => {
            const wishlistRepository = manager.getRepository(Wishlist);
            const wishlistItemRepository = manager.getRepository(WishlistItem);

            // Fetch wishlist with items for user, including product & variant
            const wishlist = await wishlistRepository.findOne({
                where: { userId },
                relations: ['items', 'items.product', 'items.variant'],
            });
            if (!wishlist) {
                throw new APIError(404, 'Wishlist not found');
            }

            // Find the item to remove
            const wishlistItem = wishlist.items.find((item) => item.id === wishlistItemId);
            if (!wishlistItem) {
                throw new APIError(404, 'Wishlist item not found');
            }

            // Delete the item
            await wishlistItemRepository.delete(wishlistItemId);

            // Remove it from the local array
            wishlist.items = wishlist.items.filter((item) => item.id !== wishlistItemId);


            wishlist.items = wishlist.items.filter((item) => {
                if (!item.product) return false;
                if (item.variant) return item.variant.stock > 0;
                return item.product.stock && item.product.stock > 0;
            });

            return wishlist;
        });
    }


    /**
     * Retrieves the wishlist for a given user including product details.
     * Filters out items whose products are deleted or out of stock.
     * @param userId - ID of the user
     * @returns Promise<Wishlist | null> - Wishlist or null if none found
     */
    async getWishlist(userId: number): Promise<Wishlist | null> {
        const wishlist = await this.wishlistRepository.findOne({
            where: { userId },
            relations: ['items', 'items.product', 'items.variant'],
        });

        if (!wishlist) {
            return null;
        }

        // Filter out wishlist items where product is missing or stock is zero
        wishlist.items = wishlist.items.filter((item) => {
            // Keep if product exists
            if (!item.product) return false;

            // If product has variants, check variant stock
            if (item.variant) {
                return item.variant.stock > 0;
            }

            // If product has no variants, check product stock
            return item.product.stock && item.product.stock > 0;
        });


        return wishlist;
    }

    /**
     * Moves an item from the wishlist to the user's cart.
     * Adds the product to the cart and removes the item from the wishlist.
     * @param userId - ID of the user
     * @param data - Contains wishlistItemId and quantity
     * @returns Promise<Wishlist> - Updated wishlist after removal
     * @throws APIError if wishlist, item, or product not found or stock is insufficient
     */
    async moveToCart(
        userId: number,
        data: IWishlistMoveToCartRequest
    ): Promise<Wishlist> {
        const { wishlistItemId, quantity } = data;

        // Fetch wishlist with items, including product & variant relations
        const wishlist = await this.wishlistRepository.findOne({
            where: { userId },
            relations: ['items', 'items.product', 'items.variant'],
        });

        if (!wishlist) {
            throw new APIError(404, 'Wishlist not found');
        }

        // Find the wishlist item
        const wishlistItem = wishlist.items.find((item) => item.id === wishlistItemId);
        if (!wishlistItem || !wishlistItem.product) {
            throw new APIError(404, 'Wishlist item or product not found');
        }

        // Add to cart, passing variantId if exists
        await this.cartService.addToCart(userId, {
            productId: wishlistItem.productId,
            variantId: wishlistItem.variantId || undefined,
            quantity,
        });

        // Remove from wishlist
        wishlist.items = wishlist.items.filter((item) => item.id !== wishlistItemId);
        await this.wishlistItemRepository.delete(wishlistItemId);

        // Optional: filter out items with no stock
        wishlist.items = wishlist.items.filter((item) => {
            if (!item.product) return false;
            if (item.variant) return item.variant.stock > 0;
            return item.product.stock && item.product.stock > 0;
        });

        return wishlist;
    }

}
