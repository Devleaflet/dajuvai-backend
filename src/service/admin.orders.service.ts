import { Repository } from 'typeorm';
import { Order, OrderStatus, PaymentStatus } from '../entities/order.entity';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';

/**
 * @class AdminOrdersService
 * @module Admin Orders
 *
 * Provides aggregated statistics for the admin orders page.
 */
export class AdminOrdersService {
    private orderRepository: Repository<Order>;

    constructor() {
        this.orderRepository = AppDataSource.getRepository(Order);
    }

    /**
     * Get aggregated stats for the orders page.
     * Runs all sub-queries in parallel.
     */
    async getOrderPageStats(): Promise<{
        processingOrders: number;
        completedLast30Days: number;
        returnRefundRate: { rate: string; returnedCancelled: number; totalOrders: number };
    }> {
        try {
            const [processingOrders, completedLast30Days, returnRefundRate] = await Promise.all([
                this.getProcessingOrdersCount(),
                this.getCompletedOrdersLast30Days(),
                this.getReturnRefundRate(),
            ]);

            return { processingOrders, completedLast30Days, returnRefundRate };
        } catch (error) {
            throw new APIError(500, 'Failed to fetch order page stats: ' + error.message);
        }
    }

    /**
     * Count in-flight orders: PENDING, SHIPPED, CONFIRMED.
     */
    async getProcessingOrdersCount(): Promise<number> {
        return this.orderRepository
            .createQueryBuilder('order')
            .where('order.status IN (:...statuses)', {
                statuses: [OrderStatus.PENDING, OrderStatus.SHIPPED],
            })
            .getCount();
    }

    /**
     * Count orders with status DELIVERED in the last 30 days.
     */
    async getCompletedOrdersLast30Days(): Promise<number> {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        return this.orderRepository
            .createQueryBuilder('order')
            .where('order.status = :status', { status: OrderStatus.DELIVERED })
            .andWhere('order.createdAt >= :since', { since: thirtyDaysAgo })
            .getCount();
    }

    /**
     * Calculate the return/refund rate as a percentage.
     * Rate = (RETURNED + CANCELLED orders) / total orders * 100
     */
    async getReturnRefundRate(): Promise<{
        rate: string;
        returnedCancelled: number;
        totalOrders: number;
    }> {
        const [totalOrders, returnedCancelled] = await Promise.all([
            this.orderRepository.count(),
            this.orderRepository
                .createQueryBuilder('order')
                .where('order.status IN (:...statuses)', {
                    statuses: [OrderStatus.RETURNED, OrderStatus.CANCELLED],
                })
                .getCount(),
        ]);

        const rate =
            totalOrders > 0
                ? ((returnedCancelled / totalOrders) * 100).toFixed(2)
                : '0.00';

        return { rate, returnedCancelled, totalOrders };
    }
}
