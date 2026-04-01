import { Repository } from "typeorm";
import { Cart } from "../entities/cart.entity";
import { OrderItem } from "../entities/orderItems.entity";
import { Wishlist } from "../entities/wishlist.entity";
import { Product } from "../entities/product.entity";
import AppDataSource from "../config/db.config";

export class ProductRecommendService {
    private cartRepo: Repository<Cart>;
    private orderItemRepo: Repository<OrderItem>;
    private wishlistRepo: Repository<Wishlist>;
    private productRepo: Repository<Product>;

    constructor() {
        this.cartRepo = AppDataSource.getRepository(Cart);
        this.orderItemRepo = AppDataSource.getRepository(OrderItem);
        this.wishlistRepo = AppDataSource.getRepository(Wishlist);
        this.productRepo = AppDataSource.getRepository(Product);
    }

    async getRecommendations(userId: number): Promise<Product[]> {
        const seenProductIds = new Set<number>();
        const subcategoryFrequency = new Map<number, number>();

        // --- Collect from past orders ---
        const orderItems = await this.orderItemRepo
            .createQueryBuilder("oi")
            .innerJoin("oi.order", "order")
            .innerJoinAndSelect("oi.product", "product")
            .where("order.orderedById = :userId", { userId })
            .getMany();

        for (const item of orderItems) {
            if (item.product?.subcategoryId) {
                seenProductIds.add(item.productId);
                subcategoryFrequency.set(
                    item.product.subcategoryId,
                    (subcategoryFrequency.get(item.product.subcategoryId) ?? 0) + 1
                );
            }
        }

        // --- Collect from cart ---
        const cart = await this.cartRepo.findOne({
            where: { userId },
            relations: ["items", "items.product"],
        });

        if (cart?.items) {
            for (const item of cart.items) {
                if (item.product?.subcategoryId) {
                    seenProductIds.add(item.product.id);
                    subcategoryFrequency.set(
                        item.product.subcategoryId,
                        (subcategoryFrequency.get(item.product.subcategoryId) ?? 0) + 1
                    );
                }
            }
        }

        // --- Collect from wishlist ---
        const wishlist = await this.wishlistRepo.findOne({
            where: { userId },
            relations: ["items", "items.product"],
        });

        if (wishlist?.items) {
            for (const item of wishlist.items) {
                if (item.product?.subcategoryId) {
                    seenProductIds.add(item.productId);
                    subcategoryFrequency.set(
                        item.product.subcategoryId,
                        (subcategoryFrequency.get(item.product.subcategoryId) ?? 0) + 1
                    );
                }
            }
        }

        if (subcategoryFrequency.size === 0) return [];

        // Sort subcategories by frequency (most interacted first)
        const sortedSubcategoryIds = [...subcategoryFrequency.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([id]) => id);

        // For each subcategory, fetch eligible products and pick up to 5 randomly
        const recommendations: Product[] = [];
        const recommendedIds = new Set<number>();

        for (const subcategoryId of sortedSubcategoryIds) {
            const products = await this.productRepo.find({
                where: { subcategoryId },
                relations: ["subcategory", "brand", "variants"],
            });

            // Exclude products already in orders/cart/wishlist
            const eligible = products.filter(
                (p) => !seenProductIds.has(p.id) && !recommendedIds.has(p.id)
            );

            // randomd products 
            for (let i = eligible.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
            }

            const picked = eligible.slice(0, 5);
            for (const p of picked) {
                recommendedIds.add(p.id);
                recommendations.push(p);
            }
        }

        return recommendations;
    }
}
