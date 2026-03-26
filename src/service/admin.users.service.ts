import { Repository } from 'typeorm';
import { Order, PaymentStatus } from '../entities/order.entity';
import { User, UserRole } from '../entities/user.entity';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';

/**
 * @class AdminUsersService
 * @module Admin Users
 *
 * Provides aggregated statistics and customer heat data for the admin users page.
 */
export class AdminUsersService {
    private userRepository: Repository<User>;
    private orderRepository: Repository<Order>;

    constructor() {
        this.userRepository = AppDataSource.getRepository(User);
        this.orderRepository = AppDataSource.getRepository(Order);
    }

    /**
     * Get aggregated stats for the users page.
     * Runs the first 3 sub-queries in parallel.
     */
    async getUserPageStats(): Promise<{
        totalUsers: number;
        newUsersThisWeek: number;
        averageOrderValue: { aov: number };
    }> {
        try {
            const [totalUsers, newUsersThisWeek, averageOrderValue] = await Promise.all([
                this.getTotalUsersCount(),
                this.getNewUsersThisWeek(),
                this.getAverageOrderValue(),
            ]);

            return { totalUsers, newUsersThisWeek, averageOrderValue };
        } catch (error) {
            throw new APIError(500, 'Failed to fetch user page stats: ' + error.message);
        }
    }

    /**
     * Count all users with role = USER.
     */
    async getTotalUsersCount(): Promise<number> {
        return this.userRepository.count({ where: { role: UserRole.USER } });
    }

    /**
     * Count new users with role = USER created in the last 7 days.
     */
    async getNewUsersThisWeek(): Promise<number> {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        return this.userRepository
            .createQueryBuilder('user')
            .where('user.role = :role', { role: UserRole.USER })
            .andWhere('user.createdAt >= :since', { since: sevenDaysAgo })
            .getCount();
    }

    /**
     * Calculate the Average Order Value (AOV) from paid orders.
     * AOV = SUM(totalPrice + shippingFee) / COUNT(*) for paymentStatus = PAID
     */
    async getAverageOrderValue(): Promise<{ aov: number }> {
        const result = await this.orderRepository
            .createQueryBuilder('order')
            .select('AVG(order.totalPrice + order.shippingFee)', 'aov')
            .where('order.paymentStatus = :paymentStatus', { paymentStatus: PaymentStatus.PAID })
            .getRawOne();

        return { aov: parseFloat(result?.aov || 0) };
    }

    /**
     * Get customer heat data: orders count and total spend per user.
     * Heat level classification:
     *   HIGH   -> orderCount >= 5
     *   MEDIUM -> orderCount >= 2
     *   LOW    -> otherwise
     *
     * @param limit - Maximum number of customers to return (default: 20)
     */
    async getCustomerHeatData(limit: number = 20): Promise<
        Array<{
            userId: number;
            fullName: string;
            email: string;
            orderCount: number;
            totalSpent: number;
            heatLevel: 'HIGH' | 'MEDIUM' | 'LOW';
        }>
    > {
        try {
            const results = await this.orderRepository
                .createQueryBuilder('order')
                .innerJoin('order.orderedBy', 'user')
                .select('user.id', 'userId')
                .addSelect('user.fullName', 'fullName')
                .addSelect('user.email', 'email')
                .addSelect('COUNT(order.id)', 'orderCount')
                .addSelect('SUM(order.totalPrice)', 'totalSpent')
                .groupBy('user.id')
                .addGroupBy('user.fullName')
                .addGroupBy('user.email')
                .orderBy('COUNT(order.id)', 'DESC')
                .limit(limit)
                .getRawMany();

            return results.map((row) => {
                const orderCount = parseInt(row.orderCount, 10);
                const heatLevel: 'HIGH' | 'MEDIUM' | 'LOW' = orderCount >= 5 ? 'HIGH' : orderCount >= 2 ? 'MEDIUM' : 'LOW';

                return {
                    userId: parseInt(row.userId, 10),
                    fullName: row.fullName,
                    email: row.email,
                    orderCount,
                    totalSpent: parseFloat(row.totalSpent || 0),
                    heatLevel,
                };
            });
        } catch (error) {
            throw new APIError(500, 'Failed to fetch customer heat data');
        }
    }
}
