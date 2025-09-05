   
import { Repository, Not } from 'typeorm';
import { Order, OrderStatus, PaymentStatus } from '../entities/order.entity';
import { User, UserRole } from '../entities/user.entity';
import { Vendor } from "../entities/vendor.entity";
import { Product } from "../entities/product.entity";
import AppDataSource from "../config/db.config";
import { APIError } from "../utils/ApiError.utils";
import { OrderItem } from '../entities/orderItems.entity';
import config  from '../config/env.config';

/**
 * @class AdminDashBoardService
 * @module Admin Dashboard
 *
 * Provides aggregated statistics and revenue data for the admin dashboard.
 * Fetches data like total sales, customer/vendor/product counts, and revenue trends.
 */
export class AdminDashBoardService {
    private orderRepository: Repository<Order>;
    private userRepository: Repository<User>;
    private vendorRepository: Repository<Vendor>;
    private productRepository: Repository<Product>;
    private orderItemRepository: Repository<OrderItem>;

    /**
     * Initializes repository instances for all entities used in the dashboard.
     */
    constructor() {
    this.orderRepository = AppDataSource.getRepository(Order);
    this.userRepository = AppDataSource.getRepository(User);
    this.vendorRepository = AppDataSource.getRepository(Vendor);
    this.productRepository = AppDataSource.getRepository(Product);
    this.orderItemRepository = AppDataSource.getRepository(OrderItem);
    }

    /**
     * Get aggregated statistics for the admin dashboard.
     *
     * @returns {Promise<object>} An object containing total sales, total orders, total customers, total vendors, and total products.
     * @access Admin
     */
    async getDashboardStats(): Promise<{
        totalSales: number;
        totalOrders: number;
        totalCustomers: number;
        totalVendors: number;
        totalProducts: number;
        totalDeliveredRevenue: number
    }> {
        try {
            const [
                totalSales,
                totalOrders,
                totalCustomers,
                totalVendors,
                totalProducts,
                totalDeliveredRevenue,
            ] = await Promise.all([
                this.getTotalSales(),
                this.getTotalOrders(),
                this.getTotalCustomers(),
                this.getTotalVendors(),
                this.getTotalProducts(),
                this.getTotalDeliveredRevenue(),
            ]);

            return {
                totalSales,
                totalOrders,
                totalCustomers,
                totalVendors,
                totalProducts,
                totalDeliveredRevenue,
            };
        } catch (error) {
            throw new APIError(500, 'Failed to fetch dashboard statistics: ' + error.message);
        }
    }

    /**
     * Calculates total sales from confirmed and paid orders.
     *
     * @returns {Promise<number>} The sum of total price and shipping fees from paid and confirmed orders.
     * @access Admin
     */
    private async getTotalSales(): Promise<number> {
        const result = await this.orderRepository
            .createQueryBuilder('order')
            .select('SUM(order.totalPrice + order.shippingFee)', 'total')
            .where('order.paymentStatus = :paymentStatus', { paymentStatus: PaymentStatus.PAID })
            .andWhere('order.status = :orderStatus', { orderStatus: OrderStatus.CONFIRMED })
            .getRawOne();

        // Convert result to number or return 0 if null
        return parseFloat(result?.total || 0);
    }

    /**
     * Counts the total number of orders.
     *
     * @returns {Promise<number>} Total order count.
     * @access Admin
     */
    private async getTotalOrders(): Promise<number> {
        return this.orderRepository.count({
            where: {
                status: Not(OrderStatus.PENDING)
            }
        });
    }

    /**
     * Counts the total number of users with USER role.
     *
     * @returns {Promise<number>} Total customer count.
     * @access Admin
     */
    private async getTotalCustomers(): Promise<number> {
        return this.userRepository.count({
            where: { role: UserRole.USER },
        });
    }

    /**
     * Counts the total number of vendors.
     *
     * @returns {Promise<number>} Total vendor count.
     * @access Admin
     */
    private async getTotalVendors(): Promise<number> {
        return this.vendorRepository.count();
    }

    /**
     * Counts the total number of products.
     *
     * @returns {Promise<number>} Total product count.
     * @access Admin
     */
    private async getTotalProducts(): Promise<number> {
        return this.productRepository.count();
    }

    /**
     * Calculates total revenue from delivered orders.
     *
     * @returns {Promise<number>} The sum of total price and shipping fees from delivered orders.
     * @access Admin
     */
    private async getTotalDeliveredRevenue(): Promise<number> {
        const result = await this.orderRepository
            .createQueryBuilder('order')
            .select('SUM(order.totalPrice + order.shippingFee)', 'total')
            .where('order.status = :orderStatus', { orderStatus: OrderStatus.DELIVERED })
            .getRawOne();

        // Convert result to number or return 0 if null
        return parseFloat(result?.total || 0);
    }

    /**
     * Fetches daily revenue data over a time range.
     *
     * @param {number} days - Number of past days to consider (default: 7).
     * @returns {Promise<Array<{ date: string, revenue: string }>>} List of date-revenue pairs sorted by date.
     * @access Admin
     */
    async getRevenueChart(days: number = 7): Promise<Array<{ date: string, revenue: string }>> {
        try {
            const data = await this.orderRepository.query(`
                SELECT 
                    TO_CHAR("createdAt", 'DD Mon') AS date,
                    SUM("totalPrice" + "shippingFee") AS revenue
                FROM orders
                WHERE "paymentStatus" = 'PAID'
                AND "createdAt" >= NOW() - INTERVAL '${days} days'
                GROUP BY date
                ORDER BY MIN("createdAt") ASC;
            `);

            return data;
        } catch (error) {
            throw new APIError(500, 'Failed to fetch daily revenue: ' + error.message);
        }
    }

    async getVendorsSalesAmount1(startDate?: string, endDate?: string){
        try {
            let query = this.vendorRepository
                .createQueryBuilder('vendor')
                .leftJoin('vendor.orderItems', 'orderItem')
                .leftJoin('orderItem.order', 'order')
                .select('vendor.id', 'vendorId')
                .addSelect('vendor.businessName', 'businessName')
                .addSelect('COALESCE(SUM(CASE WHEN order.paymentStatus = :paymentStatus AND order.status = :orderStatus THEN orderItem.price * orderItem.quantity ELSE 0 END), 0)', 'totalSales')
                .setParameters({ paymentStatus: 'PAID', orderStatus: 'CONFIRMED' });

            if (startDate) {
                query = query.andWhere('order.createdAt >= :startDate', { startDate });
            }
            if (endDate) {
                query = query.andWhere('order.createdAt <= :endDate', { endDate });
            }

            query = query.groupBy('vendor.id')
                .addGroupBy('vendor.businessName');

            const result = await query.getRawMany();
            return result;
        } catch (err) {
            throw new APIError(500, 'Failed to fetch vendors sales amount: ' + err.message);
        }
    }


    async getVendorsSalesAmount3(startDate?: string, endDate?: string): Promise<Array<{ vendorId: number, businessName: string, totalSales: number }>> {
        try {
            const vendors = await this.vendorRepository
                .createQueryBuilder('vendor')
                .leftJoin(
                    qb => qb
                        .select('oi."vendorId"', '"vendorId"')
                        .addSelect('SUM(oi.price * oi.quantity)', 'totalSales')
                        .from(OrderItem, 'oi')
                        .groupBy('oi."vendorId"'),
                    'sales',
                    '"sales"."vendorId" = vendor.id'
                )
                .select('vendor.id', 'vendorId')
                .addSelect('vendor.businessName', 'businessName')
                .addSelect('COALESCE(sales.totalSales, 0)', 'totalSales')
                .getRawMany();
            return vendors;
        } catch (err) {
            throw new APIError(500, 'Failed to fetch all vendors with total sales: ' + err.message);
        }
    }

    async getVendorsSalesAmount(startDate?:string, endDate?:string, page?:number) {
        const query = AppDataSource.getRepository(OrderItem)
    .createQueryBuilder("orderItem")
    .innerJoin(Order, "order", "order.id = orderItem.orderId")
    .innerJoin(Vendor, "vendor", "vendor.id = orderItem.vendorId")
    .select("vendor.id", "vendorId")
    .addSelect("vendor.businessName", "businessName")
    .addSelect("SUM(orderItem.quantity * orderItem.price)", "totalSales")
    .where("order.status IN (:...statuses)", {
      statuses: [OrderStatus.DELIVERED, OrderStatus.CONFIRMED],
    })
    .groupBy("vendor.id")
    .addGroupBy("vendor.businessName");

  // ✅ apply date filter only if both are provided
  if (startDate && endDate) {
    query.andWhere("order.createdAt BETWEEN :start AND :end", {
      start: new Date(startDate),
      end: new Date(endDate),
    });
  } else if (startDate) {
    query.andWhere("order.createdAt >= :start", { start: new Date(startDate) });
  } else if (endDate) {
    query.andWhere("order.createdAt <= :end", { end: new Date(endDate) });
  }
    // ✅ get all grouped rows once for count
    const allResults = await query.getRawMany();
    const totalData = allResults.length;
    // ✅ pagination
    const skip = (page - 1) * config.pagination.pageLimit;
    const data = allResults.slice(skip, skip + config.pagination.pageLimit);
    
    return {
      success: true,
      currentPage: page,
      totalPage: Math.ceil(totalData / config.pagination.pageLimit),
      totalData,
      data,
    };
  }



    async getTopProducts(startDate?:string, endDate?:string, page?:number){
       const baseQuery = AppDataSource.getRepository(OrderItem)
    .createQueryBuilder("orderItem")
    .innerJoin(Order, "order", "order.id = orderItem.orderId")
    .innerJoin(Product, "product", "product.id = orderItem.productId")
    .select("product.id", "productId")
    .addSelect("product.name", "productName")
    .addSelect("SUM(orderItem.quantity * orderItem.price)", "totalSales")
    .where("order.status IN (:...statuses)", {
      statuses: [OrderStatus.DELIVERED, OrderStatus.CONFIRMED],
    })
    .groupBy("product.id")
    .addGroupBy("product.name")
    .orderBy("SUM(orderItem.quantity * orderItem.price)", "DESC");

  if (startDate && endDate) {
    baseQuery.andWhere("order.createdAt BETWEEN :start AND :end", {
      start: new Date(startDate),
      end: new Date(endDate),
    });
  } else if (startDate) {
    baseQuery.andWhere("order.createdAt >= :start", { start: new Date(startDate) });
  } else if (endDate) {
    baseQuery.andWhere("order.createdAt <= :end", { end: new Date(endDate) });
  }

  // ✅ get all grouped rows once for count
  const allResults = await baseQuery.getRawMany();
  const totalData = allResults.length;

  // ✅ pagination
  const skip = (page - 1) * config.pagination.pageLimit;
  const data = allResults.slice(skip, skip + config.pagination.pageLimit);

  return {
    success: true,
    currentPage: page,
    totalPage: Math.ceil(totalData / config.pagination.pageLimit),
    totalData,
    data,
  }
}

async getTodayTotalSales() {
  const result = await AppDataSource.getRepository(Order)
    .createQueryBuilder("o")
    .select("COALESCE(SUM(o.totalPrice), 0)", "totalSales")
    .where("o.status IN (:...statuses)", {
      statuses: [OrderStatus.DELIVERED, OrderStatus.CONFIRMED],
    })
    .andWhere("DATE(o.createdAt) = CURRENT_DATE") 
    .getRawOne();

  return {
    totalSales: parseFloat(result.totalSales),
  };
}
}
