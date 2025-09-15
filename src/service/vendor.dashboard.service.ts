import AppDataSource from "../config/db.config";
import { OrderItem, OrderStatus } from "../entities/orderItems.entity";
import { Product } from "../entities/product.entity";
import { Order } from "../entities/order.entity";
import config from "../config/env.config";
import { InventoryStatus } from "../entities/product.enum";

export class VendorDashBoardService {
    // Repositories for DB operations on Products and OrderItems
    private productRepository = AppDataSource.getRepository(Product);
    private orderItemRepository = AppDataSource.getRepository(OrderItem);

    /**
     * Get key dashboard stats for a vendor:
     * - total products by the vendor
     * - total order items associated with the vendor
     * - total sales value (price * quantity)
     * - count of pending orders (status = PENDING)
     *
     * Note:
     * - totalProducts & totalOrders: simple counts via repo.count()
     * - totalSales: uses raw SQL SUM() on price * quantity for accuracy
     * - totalPendingOrders: joins Order entity to filter by order status
     */
    async getStats(vendorId: number) {
        // Count products linked to vendorId
        const totalProducts = await this.productRepository.count({
            where: { vendorId }
        });

        // Count order items for this vendor
        const totalOrders = await this.orderItemRepository.count({
            where: { vendorId }
        });

        // Calculate total sales by summing price * quantity
        // Raw result is an object, convert to number; fallback 0
        const totalSalesRaw = await this.orderItemRepository
            .createQueryBuilder('orderItem')
            .innerJoin('orderItem.order', 'order')
            .select('SUM(orderItem.price * orderItem.quantity)', 'totalSales')
            .where('orderItem.vendorId = :vendorId', { vendorId })
            .andWhere('order.status != :status', { status: OrderStatus.PENDING })
            .getRawOne();

        const totalSales = Number(totalSalesRaw.totalSales) || 0;

        // Count pending orders by joining order entity and filtering status
        const totalPendingOrders = await this.orderItemRepository
            .createQueryBuilder('orderItem')
            .leftJoin('orderItem.order', 'order')
            .where('orderItem.vendorId = :vendorId', { vendorId })
            .andWhere('order.status = :status', { status: OrderStatus.PENDING })
            .getCount();

        // Calculate total revenue from delivered orders by summing price * quantity
        // Only include order items where the associated order status is DELIVERED
        const revenue_raw = await this.orderItemRepository
            .createQueryBuilder('orderItem')
            .leftJoin('orderItem.order', 'order')
            .select('SUM(orderItem.price * orderItem.quantity)', 'totalDeliveredRevenue')
            .where('orderItem.vendorId = :vendorId', { vendorId })
            .andWhere('order.status = :status', { status: OrderStatus.DELIVERED })
            .getRawOne();

        const totalRevenue = Number(revenue_raw.totalDeliveredRevenue) || 0;
        // Return all stats in one object
        return {
            totalProducts,
            totalOrders,
            totalSales,
            totalPendingOrders,
            revenue: totalRevenue
        };
    }

    /**
     * Retrieve detailed order info for the vendor's orders:
     * - Product name
     * - Quantity ordered
     * - Price per unit
     * - Total for order item (price * quantity)
     * - Order status (pending, shipped, etc.)
     * - Order date/time
     *
     * Notes:
     * - Uses query builder with left joins to product and order
     * - Orders results by most recent order date DESC
     * - Maps raw results to clean JS objects with proper types
     */
    async getVendorOrders(vendorId: number) {
        const orderItems = await this.orderItemRepository
            .createQueryBuilder('orderItem')
            .leftJoin('orderItem.product', 'product')
            .leftJoin('orderItem.order', 'order')
            .select([
                'product.name AS "productName"',
                'orderItem.quantity AS "quantity"',
                'orderItem.price AS "price"',
                '(orderItem.price * orderItem.quantity) AS "total"',
                'order.status AS "orderStatus"',
                'order.createdAt AS "orderedAt"',
            ])
            .where('orderItem.vendorId = :vendorId', { vendorId })
            .orderBy('order.createdAt', 'DESC')
            .getRawMany();

        // Convert raw data strings to numbers and return neat objects
        return orderItems.map(item => ({
            productName: item.productName,
            quantity: Number(item.quantity),
            price: Number(item.price),
            total: Number(item.total),
            orderStatus: item.orderStatus,
            orderedAt: item.orderedAt,
        }));
    }

    async getTotalSales(vendorId: number, startDate?: string, endDate?: string) {
        const query = AppDataSource.getRepository(OrderItem)
            .createQueryBuilder("oi")
            .innerJoin(Order, "o", "o.id = oi.orderId")
            .select("COALESCE(SUM(oi.price), 0)", "totalSales")
            .where("oi.vendorId = :vendorId", { vendorId })
            .andWhere("o.status IN (:...statuses)", {
                statuses: [OrderStatus.DELIVERED, OrderStatus.CONFIRMED],
            });

        if (startDate && endDate) {
            query.andWhere("o.createdAt BETWEEN :start AND :end", {
                start: new Date(startDate),
                end: new Date(endDate),
            });
        } else if (startDate) {
            query.andWhere("o.createdAt >= :start", { start: new Date(startDate) });
        } else if (endDate) {
            query.andWhere("o.createdAt <= :end", { end: new Date(endDate) });
        }

        const result = await query.getRawOne();

        return {
            vendorId,
            totalSales: parseFloat(result.totalSales),
        };

    }

    async getLowStockProducts(vendorId: number, page: number) {
        const pageSize = config.pagination.pageLimit;
        const productsRepo = AppDataSource.getRepository(Product);

        // Base query
        const query = productsRepo
            .createQueryBuilder("p")
            .leftJoin("p.variants", "v")
            .innerJoin("p.vendor", "vendor")
            .select([
                "p.id AS productId",
                "p.name AS productName",
                "vendor.id AS vendorId",
                "vendor.businessName AS vendorName",
            ])
            .addSelect("COALESCE(MIN(v.stock), p.stock)", "stock")
            .addSelect("p.status", "status")
            .addSelect("MIN(v.status)", "variantStatus")
            .where("vendor.id = :vendorId", { vendorId })
            .andWhere(
                "(p.status IN (:...statuses) OR v.status IN (:...statuses))",
                { statuses: [InventoryStatus.LOW_STOCK, InventoryStatus.OUT_OF_STOCK] }
            )
            .groupBy("p.id")
            .addGroupBy("vendor.id")
            .addGroupBy("vendor.businessName")
            .addGroupBy("p.status")
            .orderBy("stock", "ASC");
        // Total count
        const totalData = await query.getCount(); // counts the grouped rows

        // Pagination
        const skip = (page - 1) * pageSize;
        const data = await query.offset(skip).limit(pageSize).getRawMany();

        return {
            success: true,
            currentPage: page,
            totalPage: Math.ceil(totalData / pageSize),
            totalData,
            data,
        };
    }
}
