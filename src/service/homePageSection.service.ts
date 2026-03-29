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
        const {
            sectionId,
            title,
            isActive,
            productSource,
            productIds,
            selectedCategoryId,
            selectedSubcategoryId,
            selectedDealId,
        } = data;

        console.log("➡️ Update request data:", data);

        const section = await this.homepageSectionRepository.findOne({
            where: { id: sectionId },
            relations: ["products", "selectedCategory", "selectedSubcategory", "selectedDeal"],
        });

        if (!section) {
            console.error(`❌ Section ${sectionId} not found`);
            throw new APIError(404, "Homepage section not found");
        }

        console.log("✅ Found section before update:", {
            id: section.id,
            title: section.title,
            productSource: section.productSource,
            selectedCategory: section.selectedCategory?.id,
            selectedSubcategory: section.selectedSubcategory?.id,
            selectedDeal: section.selectedDeal?.id,
            products: section.products?.map((p) => p.id),
        });

        // update simple fields
        if (title) {
            console.log(`✏️ Updating title: '${section.title}' → '${title}'`);
            section.title = title;
        }
        if (isActive !== undefined) {
            console.log(`✏️ Updating isActive: '${section.isActive}' → '${isActive}'`);
            section.isActive = isActive;
        }

        if (productSource !== undefined && productSource !== null) {
            console.log(`🔄 Updating productSource: '${section.productSource}' → '${productSource}'`);
            section.productSource = productSource;

            switch (productSource) {
                case ProductSource.MANUAL: {
                    console.log("📦 Updating MANUAL products:", productIds);
                    if (!productIds || productIds.length === 0) {
                        throw new APIError(400, "At least one product must be selected for manual source");
                    }
                    const products = await this.productRepository.findBy({ id: In(productIds) });
                    console.log("🔎 Found products:", products.map((p) => p.id));
                    if (products.length !== productIds.length) {
                        throw new APIError(404, "Some product IDs are invalid");
                    }
                    section.products = products;
                    section.selectedCategory = null;
                    section.selectedSubcategory = null;
                    section.selectedDeal = null;
                    break;
                }

                case ProductSource.CATEGORY: {
                    console.log("📂 Updating CATEGORY with categoryId:", selectedCategoryId);
                    if (!selectedCategoryId) throw new APIError(400, "Category is required");
                    const category = await this.categoryService.getCategoryById(selectedCategoryId);
                    console.log("🔎 Found category:", category?.id);
                    if (!category) throw new APIError(404, "Selected category does not exist");
                    section.selectedCategory = category;
                    section.products = [];
                    section.selectedSubcategory = null;
                    section.selectedDeal = null;
                    break;
                }

                case ProductSource.SUBCATEGORY: {
                    console.log("📂 Updating SUBCATEGORY with categoryId:", selectedCategoryId, "subcategoryId:", selectedSubcategoryId);
                    if (!selectedCategoryId || !selectedSubcategoryId) {
                        throw new APIError(400, "Both category and subcategory are required");
                    }
                    const subcategory = await this.subcategoyrRepo.findOne({
                        where: { id: selectedSubcategoryId, category: { id: selectedCategoryId } },
                        relations: ["category"],
                    });
                    console.log("🔎 Found subcategory:", subcategory?.id, " (belongs to category:", subcategory?.category?.id, ")");
                    if (!subcategory) throw new APIError(404, "Selected subcategory does not exist or does not belong to category");
                    section.selectedCategory = subcategory.category;
                    section.selectedSubcategory = subcategory;
                    section.products = [];
                    section.selectedDeal = null;
                    break;
                }

                case ProductSource.DEAL: {
                    console.log("💰 Updating DEAL with dealId:", selectedDealId);
                    if (!selectedDealId) throw new APIError(400, "Deal is required");
                    const deal = await this.dealService.getDealById(selectedDealId);
                    console.log("🔎 Found deal:", deal?.id);
                    if (!deal) throw new APIError(404, "Selected deal does not exist");
                    section.selectedDeal = deal;
                    section.products = [];
                    section.selectedCategory = null;
                    section.selectedSubcategory = null;
                    break;
                }

                default: {
                    console.error("❌ Invalid productSource received:", productSource);
                    throw new APIError(400, "Invalid product source");
                }
            }
        }

        console.log("✅ Section after update (before save):", {
            id: section.id,
            title: section.title,
            productSource: section.productSource,
            selectedCategory: section.selectedCategory?.id,
            selectedSubcategory: section.selectedSubcategory?.id,
            selectedDeal: section.selectedDeal?.id,
            products: section.products?.map((p) => p.id),
        });

        const saved = await this.homepageSectionRepository.save(section);

        console.log("💾 Saved section:", {
            id: saved.id,
            title: saved.title,
            productSource: saved.productSource,
            selectedCategory: saved.selectedCategory?.id,
            selectedSubcategory: saved.selectedSubcategory?.id,
            selectedDeal: saved.selectedDeal?.id,
            products: saved.products?.map((p) => p.id),
        });

        return saved;
    }


    /**
     * Retrieves all homepage sections, optionally including inactive ones.
     * 
     * @param includeInactive {boolean} - Whether to include inactive sections (default: false)
     * @returns {Promise<HomePageSection[]>} - List of homepage sections with associated products
     * @access Public/Admin
     */
    // async getAllHomePageSections(includeInactive: boolean = false) {
    //     const sections = await this.homepageSectionRepository.find({
    //         where: includeInactive ? {} : { isActive: true },
    //         relations: [
    //             'products',
    //             'products.variants',
    //             'selectedCategory',
    //             'selectedSubcategory',
    //             'selectedDeal',
    //         ],
    //         order: { id: 'ASC' },
    //     });

    //     const homepageSections = await Promise.all(
    //         sections.map(async (section) => {
    //             let products: Product[] = [];

    //             switch (section.productSource) {
    //                 case ProductSource.DEAL:
    //                     if (section.selectedDeal?.id) {
    //                         products = await this.productRepository.find({
    //                             where: { dealId: section.selectedDeal.id },
    //                             relations: ['variants'],
    //                         });
    //                     }
    //                     break;

    //                 case ProductSource.CATEGORY:
    //                     if (section.selectedCategory?.id) {
    //                         products = await this.productRepository
    //                             .createQueryBuilder('product')
    //                             .leftJoinAndSelect('product.variants', 'variants')
    //                             .leftJoin('product.subcategory', 'subcategory')
    //                             .leftJoin('subcategory.category', 'category')
    //                             .where('category.id = :id', { id: section.selectedCategory.id })
    //                             .getMany();
    //                     }
    //                     break;

    //                 case ProductSource.SUBCATEGORY:
    //                     if (section.selectedSubcategory?.id) {
    //                         products = await this.productRepository.find({
    //                             where: { subcategoryId: section.selectedSubcategory.id },
    //                             relations: ['variants'],
    //                         });
    //                     }
    //                     break;

    //                 case ProductSource.MANUAL:
    //                 default:
    //                     products = section.products || [];
    //                     break;
    //             }

    //             return { ...section, products };
    //         })
    //     );

    //     return homepageSections;
    // }


    async getAllHomePageSections(includeInactive: boolean = false, search?: string) {
        const query = this.homepageSectionRepository.createQueryBuilder('section');

        if (!includeInactive) {
            query.where('section.isActive = :isActive', { isActive: true });
        }

        if (search?.trim()) {
            const condition = 'LOWER(section.title) LIKE :search';
            const param = { search: `%${search.trim().toLowerCase()}%` };
            includeInactive
                ? query.where(condition, param)
                : query.andWhere(condition, param);
        }

        query
            .leftJoinAndSelect('section.products', 'products')
            .leftJoinAndSelect('products.variants', 'variants')
            .leftJoinAndSelect('section.selectedCategory', 'selectedCategory')
            .leftJoinAndSelect('section.selectedSubcategory', 'selectedSubcategory')
            .leftJoinAndSelect('section.selectedDeal', 'selectedDeal')
            .orderBy('section.id', 'ASC');

        const sections = await query.getMany();

        const inStockCondition = `(
            (product.hasVariants = false AND product.stock > 0)
            OR
            (product.hasVariants = true AND variants.stock > 0)
        )`;

        // --- batch fetch products for DEAL sections ---
        const dealSections = sections.filter(s => s.productSource === ProductSource.DEAL && s.selectedDeal?.id);
        const dealProductsMap = new Map<number, Product[]>();
        if (dealSections.length) {
            const dealIds = dealSections.map(s => s.selectedDeal.id);
            const dealProducts = await this.productRepository
                .createQueryBuilder('product')
                .leftJoinAndSelect('product.variants', 'variants')
                .where('product.dealId IN (:...dealIds)', { dealIds })
                .andWhere(inStockCondition)
                .getMany();
            for (const p of dealProducts) {
                const arr = dealProductsMap.get(p.dealId) ?? [];
                arr.push(p);
                dealProductsMap.set(p.dealId, arr);
            }
        }

        // --- batch fetch products for SUBCATEGORY sections ---
        const subcategorySections = sections.filter(s => s.productSource === ProductSource.SUBCATEGORY && s.selectedSubcategory?.id);
        const subcategoryProductsMap = new Map<number, Product[]>();
        if (subcategorySections.length) {
            const subcategoryIds = subcategorySections.map(s => s.selectedSubcategory.id);
            const subcategoryProducts = await this.productRepository
                .createQueryBuilder('product')
                .leftJoinAndSelect('product.variants', 'variants')
                .where('product.subcategoryId IN (:...subcategoryIds)', { subcategoryIds })
                .andWhere(inStockCondition)
                .getMany();
            for (const p of subcategoryProducts) {
                const arr = subcategoryProductsMap.get(p.subcategoryId) ?? [];
                arr.push(p);
                subcategoryProductsMap.set(p.subcategoryId, arr);
            }
        }

        // --- batch fetch products for CATEGORY sections ---
        const categorySections = sections.filter(s => s.productSource === ProductSource.CATEGORY && s.selectedCategory?.id);
        const categoryProductsMap = new Map<number, Product[]>();
        if (categorySections.length) {
            const categoryIds = categorySections.map(s => s.selectedCategory.id);
            const { entities: categoryProducts, raw } = await this.productRepository
                .createQueryBuilder('product')
                .leftJoinAndSelect('product.variants', 'variants')
                .leftJoin('product.subcategory', 'subcategory')
                .leftJoin('subcategory.category', 'category')
                .addSelect('category.id')
                .where('category.id IN (:...categoryIds)', { categoryIds })
                .andWhere(inStockCondition)
                .getRawAndEntities();
            for (let i = 0; i < categoryProducts.length; i++) {
                const categoryId = Number(raw[i].category_id);
                const arr = categoryProductsMap.get(categoryId) ?? [];
                arr.push(categoryProducts[i]);
                categoryProductsMap.set(categoryId, arr);
            }
        }

        // --- assemble sections with pre-fetched products ---
        return sections.map(section => {
            let products: Product[] = [];

            switch (section.productSource) {
                case ProductSource.DEAL:
                    products = dealProductsMap.get(section.selectedDeal?.id) ?? [];
                    break;

                case ProductSource.CATEGORY:
                    products = categoryProductsMap.get(section.selectedCategory?.id) ?? [];
                    break;

                case ProductSource.SUBCATEGORY:
                    products = subcategoryProductsMap.get(section.selectedSubcategory?.id) ?? [];
                    break;

                case ProductSource.MANUAL:
                default:
                    products = (section.products || []).filter(p =>
                        p.hasVariants ? p.variants?.some(v => v.stock > 0) : p.stock > 0
                    );
                    break;
            }

            return { ...section, products };
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
            relations: ['products', 'products.variants'],
        });

        console.log(section)
        if (!section) {
            throw new APIError(404, "Home page section not found");
        }

        let products: Product[] = [];

        switch (section.productSource) {
            case ProductSource.DEAL:
                products = await this.productRepository.find({
                    where: { dealId: section.selectedDeal?.id },
                    relations: ['variants'],
                });
                break;

            case ProductSource.CATEGORY:
                products = await this.productRepository.find({
                    where: { subcategory: { category: { id: section.selectedCategory?.id } } },
                    relations: ['variants'],
                });
                break;

            case ProductSource.SUBCATEGORY:
                products = await this.productRepository.find({
                    where: { subcategoryId: section.selectedSubcategory?.id },
                    relations: ['variants'],
                });
                break;

            case ProductSource.MANUAL:
            default:
                products = section.products;
                break;
        }

        return { ...section, products };
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
