import { In, Repository } from "typeorm";
import { HomePageSection } from "../entities/homePage.entity";
import { Product } from "../entities/product.entity";
import AppDataSource from "../config/db.config";
import { APIError } from "../utils/ApiError.utils";
import { ICreateHomepageSectionInput, IUpdateHomePageSectionInput } from "../interface/homepage.interface";

/**
 * Service to manage homepage sections including create, update, delete,
 * retrieval, and toggling activation status.
 * 
 * Module: Homepage Section Management
 */
export class HomePageSectionService {
    private homepageSectionRepository: Repository<HomePageSection>;
    private productRepository: Repository<Product>;

    /**
     * Initializes repositories for HomePageSection and Product entities.
     */
    constructor() {
        this.homepageSectionRepository = AppDataSource.getRepository(HomePageSection);
        this.productRepository = AppDataSource.getRepository(Product);
    }

    /**
     * Creates a new homepage section with given title, active status, and associated products.
     * 
     * @param data {ICreateHomepageSectionInput} - Data containing title, isActive flag, and productIds
     * @returns {Promise<HomePageSection>} - Created homepage section entity
     * @throws {APIError} - If title is missing, title already exists, or invalid product IDs
     * @access Admin
     */
    async createHomePageSection(data: ICreateHomepageSectionInput) {
        const { title, isActive, productIds } = data;

        if (!title) throw new APIError(400, 'Title is required');

        // Check if title already exists
        const existingSection = await this.homepageSectionRepository.findOne({ where: { title } });
        if (existingSection) {
            throw new APIError(409, 'Section with this title already exists');
        }

        // Validate product IDs
        const products = await this.productRepository.findBy({ id: In(productIds) });
        if (products.length !== productIds.length) {
            throw new APIError(404, 'Some product IDs are invalid');
        }

        const section = this.homepageSectionRepository.create({
            title,
            isActive,
            products,
        });

        return await this.homepageSectionRepository.save(section);
    }

    /**
     * Updates an existing homepage section's title, active status, and/or associated products.
     * 
     * @param data {IUpdateHomePageSectionInput} - Data containing sectionId, optional title, isActive, and productIds
     * @returns {Promise<HomePageSection>} - Updated homepage section entity
     * @throws {APIError} - If section not found, title conflicts, or invalid product IDs
     * @access Admin
     */
    async updateHomePageSection(data: IUpdateHomePageSectionInput) {
        const { sectionId, title, isActive, productIds } = data;

        const section = await this.homepageSectionRepository.findOne({
            where: { id: sectionId },
            relations: ['products']
        });

        if (!section) {
            throw new APIError(404, "Home page section not found");
        }

        // Check for title conflict
        if (title && title !== section.title) {
            const existingSection = await this.homepageSectionRepository.findOne({ where: { title } });
            if (existingSection) {
                throw new APIError(409, 'Section with this title already exists');
            }
            section.title = title;
        }

        if (isActive !== undefined) {
            section.isActive = isActive;
        }

        // Update associated products if provided
        if (productIds && productIds.length > 0) {
            const products = await this.productRepository.findBy({ id: In(productIds) });
            if (products.length !== productIds.length) {
                throw new APIError(404, 'Some product IDs are invalid');
            }
            section.products = products;
        }

        return await this.homepageSectionRepository.save(section);
    }

    /**
     * Retrieves all homepage sections, optionally including inactive ones.
     * 
     * @param includeInactive {boolean} - Whether to include inactive sections (default: false)
     * @returns {Promise<HomePageSection[]>} - List of homepage sections with associated products
     * @access Public/Admin
     */
    async getAllHomePageSections(includeInactive: boolean = false) {
        const whereCondition = includeInactive ? undefined : { isActive: true };

        return await this.homepageSectionRepository.find({
            where: whereCondition,
            relations: ['products', 'products.variants'],
            order: { id: 'ASC' }
        });
    }

    /**
     * Retrieves a homepage section by its ID.
     * 
     * @param sectionId {number} - ID of the homepage section
     * @returns {Promise<HomePageSection>} - Found homepage section with associated products
     * @throws {APIError} - If section not found
     * @access Public/Admin
     */
    async getHomePageSectionById(sectionId: number) {
        const section = await this.homepageSectionRepository.findOne({
            where: { id: sectionId },
            relations: ['products', 'products.variants']
        });

        if (!section) {
            throw new APIError(404, "Home page section not found");
        }

        return section;
    }

    /**
     * Deletes a homepage section by its ID.
     * 
     * @param sectionId {number} - ID of the section to delete
     * @returns {Promise<{ message: string }>} - Success message
     * @throws {APIError} - If section not found
     * @access Admin
     */
    async deleteHomePageSection(sectionId: number) {
        const section = await this.homepageSectionRepository.findOne({ where: { id: sectionId } });

        if (!section) {
            throw new APIError(404, "Home page section not found");
        }

        await this.homepageSectionRepository.remove(section);
        return { message: 'Home page section deleted successfully' };
    }

    /**
     * Toggles the active status of a homepage section by its ID.
     * 
     * @param sectionId {number} - ID of the section
     * @returns {Promise<HomePageSection>} - Updated homepage section with toggled status
     * @throws {APIError} - If section not found
     * @access Admin
     */
    async toggleSectionStatus(sectionId: number) {
        const section = await this.homepageSectionRepository.findOne({ where: { id: sectionId } });

        if (!section) {
            throw new APIError(404, "Home page section not found");
        }

        section.isActive = !section.isActive;
        return await this.homepageSectionRepository.save(section);
    }

    /**
     * Checks if a homepage section exists by title.
     * 
     * @param title {string} - Title of the homepage section
     * @returns {Promise<HomePageSection | null>} - Section entity if found, else null
     * @access Public/Admin
     */
    async checkByTitle(title: string) {
        const section = await this.homepageSectionRepository.findOne({ where: { title } });
        return section;
    }
}
