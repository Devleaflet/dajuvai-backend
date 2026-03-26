import { Repository } from 'typeorm';
import { Vendor } from '../entities/vendor.entity';
import { OrderItem } from '../entities/orderItems.entity';
import { Order, OrderStatus, PaymentStatus } from '../entities/order.entity';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';

/**
 * @class AdminVendorsService
 * @module Admin Vendors
 *
 * Provides aggregated statistics and data for the admin vendors page.
 */
export class AdminVendorsService {
    private vendorRepository: Repository<Vendor>;
    private orderItemRepository: Repository<OrderItem>;

    constructor() {
        this.vendorRepository = AppDataSource.getRepository(Vendor);
        this.orderItemRepository = AppDataSource.getRepository(OrderItem);
    }

    /**
     * Get aggregated stats for the vendors page.
     * Runs all sub-queries in parallel.
     */
    async getVendorPageStats(): Promise<{
        totalVendors: number;
        pendingApprovals: number;
        topEarningVendor: { vendorId: number; businessName: string; totalRevenue: number } | null;
    }> {
        try {
            const [totalVendors, pendingApprovals, topEarningVendor] = await Promise.all([
                this.getTotalVendorsCount(),
                this.getPendingApprovalsCount(),
                this.getTopEarningVendorThisMonth(),
            ]);

            return { totalVendors, pendingApprovals, topEarningVendor };
        } catch (error) {
            throw new APIError(500, 'Failed to fetch vendor page stats: ' + error.message);
        }
    }

    /**
     * Count all vendors with no filter.
     */
    async getTotalVendorsCount(): Promise<number> {
        return this.vendorRepository.count();
    }

    /**
     * Count vendors where isApproved = false.
     */
    async getPendingApprovalsCount(): Promise<number> {
        return this.vendorRepository.count({ where: { isApproved: false } });
    }

    /**
     * Get the top earning vendor for the current calendar month.
     * Joins OrderItem -> Order -> Vendor, filters by DELIVERED/CONFIRMED + PAID orders
     * within the current month, groups by vendor, sums revenue, returns the top 1.
     */
    async getTopEarningVendorThisMonth(): Promise<{
        vendorId: number;
        businessName: string;
        totalRevenue: number;
    } | null> {
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        const result = await this.orderItemRepository
            .createQueryBuilder('orderItem')
            .innerJoin('orderItem.order', 'order')
            .innerJoin('orderItem.vendor', 'vendor')
            .select('vendor.id', 'vendorId')
            .addSelect('vendor.businessName', 'businessName')
            .addSelect('SUM(orderItem.quantity * orderItem.price)', 'totalRevenue')
            .where('order.status IN (:...statuses)', {
                statuses: [OrderStatus.DELIVERED, OrderStatus.CONFIRMED, OrderStatus.SHIPPED],
            })
            .andWhere('order.paymentStatus = :paymentStatus', { paymentStatus: PaymentStatus.PAID })
            .andWhere('order.createdAt BETWEEN :start AND :end', {
                start: firstDayOfMonth,
                end: now,
            })
            .groupBy('vendor.id')
            .addGroupBy('vendor.businessName')
            .orderBy('SUM(orderItem.quantity * orderItem.price)', 'DESC')
            .limit(1)
            .getRawOne();

        if (!result) return null;

        return {
            vendorId: parseInt(result.vendorId),
            businessName: result.businessName,
            totalRevenue: parseFloat(result.totalRevenue || 0),
        };
    }
}
