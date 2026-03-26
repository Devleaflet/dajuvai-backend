import AppDataSource from '../config/db.config';
import { Product } from '../entities/product.entity';
import { InventoryStatus } from '../entities/product.enum';
import { Review } from '../entities/reviews.entity';
import { OrderItem } from '../entities/orderItems.entity';

export class VendorProductsService {
    private productRepository = AppDataSource.getRepository(Product);
    private reviewRepository = AppDataSource.getRepository(Review);

    /**
     * Returns product page stat cards for the vendor:
     * - totalActiveProducts: count of AVAILABLE products
     * - outOfStockCount: count of OUT_OF_STOCK products
     * - topSellingItem: single best-selling product by quantity
     */
    async getProductPageStats(vendorId: number) {
        const [totalActiveProducts, outOfStockCount, topSellingItem] = await Promise.all([
            this.getTotalActiveProducts(vendorId),
            this.getOutOfStockCount(vendorId),
            this.getTopSellingItem(vendorId),
        ]);

        return { totalActiveProducts, outOfStockCount, topSellingItem };
    }

    /**
     * Count products for the vendor that are in AVAILABLE status.
     */
    async getTotalActiveProducts(vendorId: number): Promise<number> {
        return this.productRepository.count({
            where: {
                vendorId,
                status: InventoryStatus.AVAILABLE,
            },
        });
    }

    /**
     * Count products for the vendor that are in OUT_OF_STOCK status.
     */
    async getOutOfStockCount(vendorId: number): Promise<number> {
        return this.productRepository.count({
            where: {
                vendorId,
                status: InventoryStatus.OUT_OF_STOCK,
            },
        });
    }

    /**
     * Returns the single top-selling product for the vendor based on total quantity sold
     * across PAID orders.
     *
     * NOTE: ORDER BY uses the raw SUM expression (not the alias) because PostgreSQL
     * lowercases column aliases and TypeORM raw queries are case-sensitive.
     */
    async getTopSellingItem(vendorId: number) {
        const raw = await AppDataSource.getRepository(OrderItem)
            .createQueryBuilder('oi')
            .innerJoin('oi.product', 'product')
            .innerJoin('oi.order', 'order')
            .where('oi.vendorId = :vendorId', { vendorId })
            .andWhere('order.paymentStatus = :paymentStatus', { paymentStatus: 'PAID' })
            .select('product.id', 'productId')
            .addSelect('product.name', 'productName')
            .addSelect('SUM(oi.quantity)', 'totalSold')
            .addSelect('SUM(oi.quantity * oi.price)', 'totalRevenue')
            .groupBy('product.id')
            .addGroupBy('product.name')
            .orderBy('SUM(oi.quantity)', 'DESC')
            .limit(1)
            .getRawOne();

        if (!raw) return null;

        return {
            productId: parseInt(raw.productId, 10),
            productName: raw.productName as string,
            totalSold: parseInt(raw.totalSold, 10),
            totalRevenue: parseFloat(raw.totalRevenue),
        };
    }

    /**
     * Returns the most recent reviews left on any product belonging to this vendor.
     * TypeORM nests related product and user objects automatically.
     */
    async getRecentReviews(vendorId: number, limit: number = 10) {
        return AppDataSource.getRepository(Review)
            .createQueryBuilder('review')
            .innerJoin('review.product', 'product')
            .leftJoin('review.user', 'user')
            .select(['review.id', 'review.rating', 'review.comment', 'review.createdAt'])
            .addSelect(['product.id', 'product.name'])
            .addSelect(['user.id', 'user.fullName'])
            .where('product.vendorId = :vendorId', { vendorId })
            .orderBy('review.createdAt', 'DESC')
            .take(limit)
            .getMany();
    }
}
