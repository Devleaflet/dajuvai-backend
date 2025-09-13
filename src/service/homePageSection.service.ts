import { In, Repository } from "typeorm";
import { HomePageSection } from "../entities/homePage.entity";
import { Product } from "../entities/product.entity";
import AppDataSource from "../config/db.config";
import { APIError } from "../utils/ApiError.utils";
import { ICreateHomepageSectionInput, IUpdateHomePageSectionInput } from "../interface/homepage.interface";
import { ProductSource } from "../entities/banner.entity";
import { CategoryService } from "./category.service";
import { SubcategoryService } from "./subcategory.service";
import { DealService } from "./deal.service";
import { AuthProvider } from "../entities/user.entity";
import { Subcategory } from "../entities/subcategory.entity";

/**
 * Service to manage homepage sections including create, update, delete,
 * retrieval, and toggling activation status.
 * 
 * Module: Homepage Section Management
 */
export class HomePageSectionService {
    private homepageSectionRepository: Repository<HomePageSection>;
    private productRepository: Repository<Product>;
    private categoryService: CategoryService;
    private subcategoryService: SubcategoryService;
    private dealService: DealService;
    private subcategoyrRepo: Repository<Subcategory>;

    /**
     * Initializes repositories for HomePageSection and Product entities.
     */
    constructor() {
        this.homepageSectionRepository = AppDataSource.getRepository(HomePageSection);
        this.productRepository = AppDataSource.getRepository(Product);
        this.categoryService = new CategoryService()
        this.subcategoryService = new SubcategoryService();
        this.dealService = new DealService();
        this.subcategoyrRepo = AppDataSource.getRepository(Subcategory);
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
        const { title, isActive, productIds, productSource, selectedCategoryId, selectedDealId, selectedSubcategoryId } = data;

        const section = this.homepageSectionRepository.create({
            title,
            productSource,
            isActive
        })

        switch (productSource) {
            case ProductSource.MANUAL:

                const products = await this.productRepository.findBy({ id: In(productIds) })
                if (products.length !== productIds.length) {
                    throw new APIError(404, "Some product IDs are invalid");
                }

                section.products = products
                break;


            case ProductSource.CATEGORY:

                const category = await this.categoryService.getCategoryById(selectedCategoryId);

                section.selectedCategory = category

                break;

            case ProductSource.SUBCATEGORY:

                const subcategory = await this.subcategoryService.handleGetSubcategoryById(selectedSubcategoryId);

                section.selectedSubcategory = subcategory;

                break;

            case ProductSource.DEAL:

                const deal = await this.dealService.handleGetDealById(selectedDealId);

                section.selectedDeal = deal;

                break;

            default:
                throw new APIError(400, "Invalid product source")
        }

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
        const { sectionId, title, isActive, productSource, productIds, selectedCategoryId, selectedSubcategoryId, selectedDealId } = data;

        const section = await this.homepageSectionRepository.findOne({
            where: { id: sectionId },
            relations: ["products", "selectedCategory", "selectedSubcategory", "selectedDeal"]
        });

        if (!section) throw new APIError(404, "Homepage section not found");

        if (title) section.title = title;
        if (isActive !== undefined) section.isActive = isActive;
        if (productSource) section.productSource = productSource;

        switch (productSource) {
            case ProductSource.MANUAL:
                if (!productIds || productIds.length === 0) {
                    throw new APIError(400, "At least one product must be selected for manual source");
                }
                const products = await this.productRepository.findBy({ id: In(productIds) });
                if (products.length !== productIds.length) {
                    throw new APIError(404, "Some product IDs are invalid");
                }
                section.products = products;
                section.selectedCategory = null;
                section.selectedSubcategory = null;
                section.selectedDeal = null;
                break;

            case ProductSource.CATEGORY:
                if (!selectedCategoryId) throw new APIError(400, "Category is required");
                const category = await this.categoryService.getCategoryById(selectedCategoryId)
                if (!category) throw new APIError(404, "Selected category does not exist");
                section.selectedCategory = category;
                section.products = [];
                section.selectedSubcategory = null;
                section.selectedDeal = null;
                break;

            case ProductSource.SUBCATEGORY:
                if (!selectedCategoryId || !selectedSubcategoryId) {
                    throw new APIError(400, "Both category and subcategory are required");
                }
                const subcategory = await this.subcategoyrRepo.findOne({
                    where: { id: selectedSubcategoryId, category: { id: selectedCategoryId } },
                    relations: ["category"]
                });
                if (!subcategory) throw new APIError(404, "Selected subcategory does not exist or does not belong to category");
                section.selectedCategory = subcategory.category;
                section.selectedSubcategory = subcategory;
                section.products = [];
                section.selectedDeal = null;
                break;

            case ProductSource.DEAL:
                if (!selectedDealId) throw new APIError(400, "Deal is required");
                const deal = await this.dealService.getDealById(selectedDealId);
                if (!deal) throw new APIError(404, "Selected deal does not exist");
                section.selectedDeal = deal;
                section.products = [];
                section.selectedCategory = null;
                section.selectedSubcategory = null;
                break;

            default:
                throw new APIError(400, "Invalid product source");
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
        const query = this.homepageSectionRepository
            .createQueryBuilder("section")
            .leftJoinAndSelect("section.products", "product")
            .leftJoinAndSelect("product.variants", "variant");

        if (!includeInactive) {
            query.where("section.isActive = :isActive", { isActive: true });
        }

        // filter products by status
        query.andWhere("product.status IN (:...statuses)", {
            statuses: ["AVAILABLE", "LOW_STOCK"],
        });

        query.orderBy("section.id", "ASC");

        return await query.getMany();
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
