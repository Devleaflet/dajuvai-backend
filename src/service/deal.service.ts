import { Repository } from 'typeorm';
import { Deal, DealStatus } from '../entities/deal.entity';
import { Product } from '../entities/product.entity';
import { CreateDealInput, UpdateDealInput } from '../utils/zod_validations/deal.zod';
import { APIError } from '../utils/ApiError.utils';
import AppDataSource from '../config/db.config';
import { User } from '../entities/user.entity';
/**
 * Service for managing deal-related operations including creation, update, 
 * retrieval, and deletion of promotional deals.
 * 
 * Module: Deal Management (Admin)
 */
export class DealService {
    private dealRepository: Repository<Deal>;
    private productRepository: Repository<Product>;
    private userRepository: Repository<User>;

    /**
     * Initializes repositories for Deal, Product, and User entities.
     */
    constructor() {
        this.dealRepository = AppDataSource.getRepository(Deal);
        this.productRepository = AppDataSource.getRepository(Product);
        this.userRepository = AppDataSource.getRepository(User);
    }

    /**
     * Creates a new promotional deal by an admin.
     * 
     * @param dto {CreateDealInput} - Deal creation data (name, discount, status, etc.)
     * @param adminId {number} - ID of the admin creating the deal
     * @returns {Promise<Deal>} - The newly created deal
     * @throws {APIError} - If admin not found or deal name already exists
     * @access Admin
     */
    async createDeal(dto: CreateDealInput, adminId: number): Promise<Deal> {
        const user = await this.userRepository.findOne({ where: { id: adminId } });
        if (!user) {
            throw new APIError(404, 'Admin not found');
        }

        const existingDeal = await this.dealRepository.findOne({ where: { name: dto.name } });
        if (existingDeal) {
            throw new APIError(400, 'Deal name already exists');
        }

        const deal = this.dealRepository.create({
            ...dto,
            createdById: adminId,
        });

        return this.dealRepository.save(deal);
    }

    /**
     * Updates an existing deal by its ID.
     * 
     * @param id {number} - Deal ID
     * @param dto {UpdateDealInput} - Fields to update (name, discount, status, etc.)
     * @returns {Promise<Deal>} - The updated deal
     * @throws {APIError} - If deal not found
     * @access Admin
     */
    async updateDeal(id: number, dto: UpdateDealInput): Promise<Deal> {
        const deal = await this.dealRepository.findOne({ where: { id } });
        if (!deal) {
            throw new APIError(404, 'Deal not found');
        }

        const updatedData = {
            ...deal,
            ...dto,
        };

        await this.dealRepository.update(id, updatedData);

        // findOneOrFail throws if entity doesn't exist (safer for chained logic)
        return await this.dealRepository.findOneOrFail({ where: { id } });
    }

    /**
     * Retrieves a deal by its ID along with the admin who created it.
     * 
     * @param id {number} - Deal ID
     * @returns {Promise<Deal>} - The deal entity
     * @throws {APIError} - If deal not found
     * @access Admin
     */
    async getDealById(id: number): Promise<Deal> {
        const deal = await this.dealRepository.findOne({ where: { id }, relations: ['createdBy'] });
        if (!deal) {
            throw new APIError(404, 'Deal not found');
        }
        return deal;
    }

    /**
     * Retrieves all deals optionally filtered by status.
     * Also returns the number of products associated with each deal.
     * 
     * @param status {DealStatus} - Optional filter by deal status (ACTIVE, INACTIVE, etc.)
     * @returns {Promise<{ deals: Deal[], total: number, productCounts: { [dealId: number]: number } }>}
     *          List of deals, total count, and product count mapping
     * @access Admin
     */
    async getAllDeals(status?: DealStatus): Promise<{ deals: Deal[], total: number, productCounts: { [dealId: number]: number } }> {
        const query = this.dealRepository.createQueryBuilder('deal')
            .leftJoinAndSelect('deal.createdBy', 'createdBy');

        if (status) {
            query.where('deal.status = :status', { status });
        }

        const deals = await query.getMany();
        const total = await query.getCount();

        // Count how many products are assigned to each deal
        const productCounts = await this.productRepository.createQueryBuilder('product')
            .select('product.dealId', 'dealId')
            .addSelect('COUNT(product.id)', 'count')
            .where('product.dealId IS NOT NULL')
            .groupBy('product.dealId')
            .getRawMany();

        const productCountMap = productCounts.reduce((acc, { dealId, count }) => {
            acc[dealId] = Number(count);
            return acc;
        }, {} as { [dealId: number]: number });

        return { deals, total, productCounts: productCountMap };
    }

    /**
     * Deletes a deal by its ID and unassigns it from all products.
     * 
     * @param id {number} - Deal ID to delete
     * @returns {Promise<Deal>} - The deleted deal data
     * @throws {APIError} - If deal not found
     * @access Admin
     */
    async deleteDeal(id: number): Promise<Deal> {
        const deal = await this.dealRepository.findOne({ where: { id } });
        if (!deal) {
            throw new APIError(404, 'Deal not found');
        }

        // Unassign deal from all products
        await this.productRepository.update({ dealId: id }, { dealId: null });

        // Delete deal
        await this.dealRepository.delete(id);

        return deal;
    }
}
