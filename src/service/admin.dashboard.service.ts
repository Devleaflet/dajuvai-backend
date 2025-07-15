import { Repository, Not } from 'typeorm';
import { Order, OrderStatus, PaymentStatus } from '../entities/order.entity';
import { User, UserRole } from '../entities/user.entity';
import { Vendor } from "../entities/vendor.entity";
import { Product } from "../entities/product.entity";
import AppDataSource from "../config/db.config";
import { APIError } from "../utils/ApiError.utils";

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

    /**
     * Initializes repository instances for all entities used in the dashboard.
     */
    constructor() {
        this.orderRepository = AppDataSource.getRepository(Order);
        this.userRepository = AppDataSource.getRepository(User);
        this.vendorRepository = AppDataSource.getRepository(Vendor);
        this.productRepository = AppDataSource.getRepository(Product);
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
}
