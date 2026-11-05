import AppDataSource from '../config/db.config';
import { OrderItem } from '../entities/orderItems.entity';
import { OrderStatus } from '../entities/order.entity';

export class VendorOrdersService {
    private orderItemRepository = AppDataSource.getRepository(OrderItem);

    /**
     * Returns order page stat cards for the vendor:
     * Each card counts orders (the cards and the table say "orders"); an
     * order with three of this vendor's lines is still one order.
     * - needingFulfillment: orders still ORDER_PLACED
     * - inDelivery: orders with a rider
     * - completedToday: orders delivered today
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
     * Count this vendor's orders where the parent order is ORDER_PLACED.
     */
    async getNeedingFulfillmentCount(vendorId: number): Promise<number> {
        return this.orderItemRepository
            .createQueryBuilder('oi')
            .innerJoin('oi.order', 'order')
            .where('oi.vendorId = :vendorId', { vendorId })
            .andWhere('order.status = :status', { status: OrderStatus.ORDER_PLACED })
            .select('COUNT(DISTINCT order.id)', 'count')
            .getRawOne()
            .then((row) => Number(row?.count ?? 0));
    }

    /**
     * Count this vendor's orders where the parent order is ASSIGNED_TO_RIDER.
     */
    async getInDeliveryCount(vendorId: number): Promise<number> {
        return this.orderItemRepository
            .createQueryBuilder('oi')
            .innerJoin('oi.order', 'order')
            .where('oi.vendorId = :vendorId', { vendorId })
            .andWhere('order.status = :status', { status: OrderStatus.ASSIGNED_TO_RIDER })
            .select('COUNT(DISTINCT order.id)', 'count')
            .getRawOne()
            .then((row) => Number(row?.count ?? 0));
    }

    /**
     * Count this vendor's orders that were delivered today.
     * Uses DATE() comparison against CURRENT_DATE for timezone-aware accuracy.
     */
    async getCompletedTodayCount(vendorId: number): Promise<number> {
        return this.orderItemRepository
            .createQueryBuilder('oi')
            .innerJoin('oi.order', 'order')
            .where('oi.vendorId = :vendorId', { vendorId })
            .andWhere('order.status = :status', { status: OrderStatus.DELIVERED })
            .andWhere('DATE(order.updatedAt) = CURRENT_DATE')
            .select('COUNT(DISTINCT order.id)', 'count')
            .getRawOne()
            .then((row) => Number(row?.count ?? 0));
    }
}
