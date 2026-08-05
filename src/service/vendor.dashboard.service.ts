import AppDataSource from "../config/db.config";
import { OrderItem } from "../entities/orderItems.entity";
import { Product } from "../entities/product.entity";
import { Order, OrderStatus } from "../entities/order.entity";
import config from "../config/env.config";
import { InventoryStatus } from "../entities/product.enum";
import { getVendorInventoryAlertCounts } from "./vendor-inventory-alerts.service";
import { IsNull } from "typeorm";

const REALIZED_ORDER_STATUSES = [OrderStatus.CONFIRMED, OrderStatus.DELIVERED];

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
            where: { vendorId, deletedAt: IsNull() }
        });

        // Count distinct orders; one order can contain multiple vendor items.
        const totalOrdersRaw = await this.orderItemRepository
            .createQueryBuilder("orderItem")
            .innerJoin("orderItem.order", "order")
            .select("COUNT(DISTINCT order.id)", "totalOrders")
            .where("orderItem.vendorId = :vendorId", { vendorId })
            .getRawOne();
        const totalOrders = Number(totalOrdersRaw?.totalOrders) || 0;

        // Calculate total sales by summing price * quantity
        // Raw result is an object, convert to number; fallback 0
        const totalSalesRaw = await this.orderItemRepository
            .createQueryBuilder('orderItem')
            .innerJoin('orderItem.order', 'order')
            .select('SUM(orderItem.price * orderItem.quantity)', 'totalSales')
            .where('orderItem.vendorId = :vendorId', { vendorId })
            .andWhere('order.paymentStatus = :paymentStatus', { paymentStatus: 'PAID' })
            .andWhere('order.status IN (:...realizedStatuses)', { realizedStatuses: REALIZED_ORDER_STATUSES })
            .getRawOne();

        const totalSales = Number(totalSalesRaw?.totalSales) || 0;

        // Count pending orders by joining order entity and filtering status
        const totalPendingOrdersRaw = await this.orderItemRepository
            .createQueryBuilder('orderItem')
            .leftJoin('orderItem.order', 'order')
            .where('orderItem.vendorId = :vendorId', { vendorId })
            .andWhere('order.status = :status', { status: OrderStatus.ORDER_PLACED })
            .select("COUNT(DISTINCT order.id)", "totalPendingOrders")
            .getRawOne();
        const totalPendingOrders = Number(totalPendingOrdersRaw?.totalPendingOrders) || 0;

        // Low-stock and out-of-stock counts, split, across ALL of the vendor's
        // products (not just the current page). Classification mirrors
        // ProductList.tsx's `getVariantStatus` row badge exactly, so these
        // counts always agree with what the product table itself shows:
        // - no variants: the product's own status column decides.
        // - has variants: ALL variants out-of-stock -> out-of-stock; ANY
        //   variant low/out (but not all out) -> low-stock; else available.
        const productsForStock = await this.productRepository.find({
            where: { vendorId, deletedAt: IsNull() },
            relations: ["variants"],
        });

        const { lowStockCount, outOfStockCount } =
            getVendorInventoryAlertCounts(productsForStock);

        // Return all stats in one object
        return {
            totalProducts,
            totalOrders,
            totalSales,
            totalPendingOrders,
            lowStockCount,
            outOfStockCount,
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
            .select("COALESCE(SUM(oi.price * oi.quantity), 0)", "totalSales")
            .where("oi.vendorId = :vendorId", { vendorId })
            .andWhere("o.status IN (:...statuses)", {
                statuses: [OrderStatus.DELIVERED, OrderStatus.CONFIRMED],
            })
            .andWhere("o.paymentStatus = :paymentStatus", { paymentStatus: "PAID" });

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
            totalSales: Number(result?.totalSales) || 0,
        };

    }

    /** Return a zero-filled paid-sales point for every calendar day in range. */
    async getSalesTrend(vendorId: number, startDate: Date, endDate: Date) {
        const rows = await this.orderItemRepository
            .createQueryBuilder("oi")
            .innerJoin(Order, "o", "o.id = oi.orderId")
            .select("TO_CHAR(DATE(o.createdAt), 'YYYY-MM-DD')", "date")
            .addSelect("COALESCE(SUM(oi.price * oi.quantity), 0)", "totalSales")
            .where("oi.vendorId = :vendorId", { vendorId })
            .andWhere("o.paymentStatus = :paymentStatus", { paymentStatus: "PAID" })
            .andWhere("o.status IN (:...realizedStatuses)", { realizedStatuses: REALIZED_ORDER_STATUSES })
            .andWhere("o.createdAt >= :startDate AND o.createdAt <= :endDate", { startDate, endDate })
            .groupBy("DATE(o.createdAt)")
            .orderBy("DATE(o.createdAt)", "ASC")
            .getRawMany();
        const totals = new Map(rows.map((row) => [row.date, Number(row.totalSales) || 0]));
        const points: Array<{ date: string; totalSales: number }> = [];
        const cursor = new Date(startDate);
        cursor.setHours(0, 0, 0, 0);
        const last = new Date(endDate);
        last.setHours(0, 0, 0, 0);
        while (cursor <= last) {
            // Use the server/database calendar date, not UTC serialization;
            // UTC conversion shifts midnight for Nepal and similar timezones.
            const date = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
            points.push({ date, totalSales: totals.get(date) ?? 0 });
            cursor.setDate(cursor.getDate() + 1);
        }
        return points;
    }

    async getLowStockProducts(vendorId: number, page: number) {
        const pageSize = 5;
        const productsRepo = AppDataSource.getRepository(Product);

        // Base query
        const query = productsRepo
            .createQueryBuilder("p")
            .leftJoin("p.variants", "v", "v.deletedAt IS NULL")
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
            .andWhere("p.deletedAt IS NULL")
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


    async getTopProductsByVendor(vendorId: number, limit = 5, startDate?: string, endDate?: string) {
        const qb = AppDataSource.getRepository(OrderItem)
            .createQueryBuilder("oi")
            .select("p.id", "productId")
            .addSelect("p.name", "productName")
            .addSelect("SUM(oi.quantity)", "totalquantity")
            .addSelect("SUM(oi.price * oi.quantity)", "totalSales")
            .innerJoin("oi.product", "p")
            .innerJoin("oi.order", "o")
            .where("oi.vendorId = :vendorId", { vendorId })
            .andWhere("o.paymentStatus = :status", { status: "PAID" })
            .andWhere("o.status IN (:...realizedStatuses)", { realizedStatuses: REALIZED_ORDER_STATUSES })
            .andWhere("p.deletedAt IS NULL");

        if (startDate && endDate) {
            qb.andWhere("o.createdAt BETWEEN :startDate AND :endDate", { startDate, endDate });
        } else if (startDate) {
            qb.andWhere("o.createdAt >= :startDate", { startDate });
        } else if (endDate) {
            qb.andWhere("o.createdAt <= :endDate", { endDate });
        }

        qb.groupBy("p.id")
            .addGroupBy("p.name")
            .orderBy("totalquantity", "DESC")
            .limit(limit);

        const rawResult = await qb.getRawMany();
        const result = rawResult.map(r => ({
            productId: Number(r.productId) || 0,
            productName: r.productName || "Unnamed product",
            totalquantity: Number(r.totalquantity) || 0,
            totalSales: Number(r.totalSales) || 0,
        }));

        return result;
    }



    async getRevenueBySubcategoryForVendor(vendorId: number, filterParams: { startDate?: string, endDate?: string }) {

        const { startDate, endDate } = filterParams;
        const qb = AppDataSource.getRepository(OrderItem)
            .createQueryBuilder("oi")
            .select("sc.name", "subcategory")
            .addSelect("SUM(oi.price * oi.quantity)", "revenue")
            .innerJoin("oi.order", "o")
            .innerJoin("oi.product", "p")
            .leftJoin("p.subcategory", "sc")
            .where("o.paymentStatus = :paymentStatus", { paymentStatus: "PAID" })
            .andWhere("oi.vendorId = :vendorId", { vendorId }) //  filter for vendor
            .andWhere("o.status IN (:...realizedStatuses)", { realizedStatuses: REALIZED_ORDER_STATUSES })
            .groupBy("sc.name")
            .orderBy("revenue", "DESC");

        if (startDate && endDate) {
            qb.andWhere("o.createdAt BETWEEN :startDate AND :endDate", { startDate, endDate });
        } else if (startDate) {
            qb.andWhere("o.createdAt >= :startDate", { startDate });
        } else if (endDate) {
            qb.andWhere("o.createdAt <= :endDate", { endDate });
        }

        const result = await qb.getRawMany();

        return result.map((r) => ({
            subcategory: r.subcategory || "Uncategorized",
            revenue: parseFloat(r.revenue || 0),
        }));
    }


    async revenueByCategoryForVendor(vendorId: number, filterParams: { startDate?: string, endDate?: string }) {
        const { startDate, endDate } = filterParams;

        const qb = AppDataSource.getRepository(OrderItem)
            .createQueryBuilder("oi")
            .select("c.name", "category")
            .addSelect("SUM(oi.price * oi.quantity)", "revenue")
            .innerJoin("oi.order", "o")
            .innerJoin("oi.product", "p")
            .leftJoin("p.subcategory", "sc")
            .leftJoin("sc.category", "c")
            .where("o.paymentStatus = :paymentStatus", { paymentStatus: "PAID" })
            .andWhere("oi.vendorId = :vendorId", { vendorId })
            .andWhere("o.status IN (:...realizedStatuses)", { realizedStatuses: REALIZED_ORDER_STATUSES })
            .groupBy("c.name")
            .orderBy("revenue", "DESC");


        if (startDate && endDate) {
            qb.andWhere("o.createdAt BETWEEN :startDate AND :endDate", { startDate, endDate });
        } else if (startDate) {
            qb.andWhere("o.createdAt >= :startDate", { startDate });
        } else if (endDate) {
            qb.andWhere("o.createdAt <= :endDate", { endDate });
        }

        const result = await qb.getRawMany();

        return result.map(r => ({
            category: r.category || "Uncategorized",
            revenue: parseFloat(r.revenue || 0),
        }));
    }

}
