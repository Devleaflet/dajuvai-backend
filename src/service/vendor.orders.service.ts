import AppDataSource from '../config/db.config';
import { OrderItem } from '../entities/orderItems.entity';
import { OrderStatus } from '../entities/order.entity';

export class VendorOrdersService {
    private orderItemRepository = AppDataSource.getRepository(OrderItem);

    /**
     * Returns order page stat cards for the vendor:
     * - needingFulfillment: PENDING order items awaiting action
     * - inDelivery: order items currently SHIPPED or OUT_FOR_DELIVERY
     * - completedToday: order items marked DELIVERED today
     */
    async getOrderPageStats(vendorId: number) {
        const [needingFulfillment, inDelivery, completedToday] = await Promise.all([
            this.getNeedingFulfillmentCount(vendorId),
            this.getInDeliveryCount(vendorId),
            this.getCompletedTodayCount(vendorId),
        ]);

        return { needingFulfillment, inDelivery, completedToday };
    }

    /**
     * Count order items for this vendor where the parent order is PENDING.
     */
    async getNeedingFulfillmentCount(vendorId: number): Promise<number> {
        return this.orderItemRepository
            .createQueryBuilder('oi')
            .innerJoin('oi.order', 'order')
            .where('oi.vendorId = :vendorId', { vendorId })
            .andWhere('order.status = :status', { status: OrderStatus.PENDING })
            .getCount();
    }

    /**
     * Count order items for this vendor where the parent order is SHIPPED or OUT_FOR_DELIVERY.
     */
    async getInDeliveryCount(vendorId: number): Promise<number> {
        return this.orderItemRepository
            .createQueryBuilder('oi')
            .innerJoin('oi.order', 'order')
            .where('oi.vendorId = :vendorId', { vendorId })
            .andWhere('order.status = :status', { status: OrderStatus.SHIPPED })
            .getCount();
    }

    /**
     * Count order items for this vendor that were delivered today.
     * Uses DATE() comparison against CURRENT_DATE for timezone-aware accuracy.
     */
    async getCompletedTodayCount(vendorId: number): Promise<number> {
        return this.orderItemRepository
            .createQueryBuilder('oi')
            .innerJoin('oi.order', 'order')
            .where('oi.vendorId = :vendorId', { vendorId })
            .andWhere('order.status = :status', { status: OrderStatus.DELIVERED })
            .andWhere('DATE(order.updatedAt) = CURRENT_DATE')
            .getCount();
    }
}
