import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { User, UserRole } from '../entities/user.entity';
import { CreateCategoryInput, UpdateCategoryInput } from '../utils/zod_validations/category.zod';
import AppDataSource from '../config/db.config';
import { APIError } from '../utils/ApiError.utils';
import { Subcategory } from '../entities/subcategory.entity';
import { CloudinaryService } from './image.service';
/**
 * Service for managing category-related operations.
 * 
 * Module: Category Management (Admin)
 */
export class CategoryService {
    private categoryRepository: Repository<Category>;
    private userRepository: Repository<User>;
    private subcategoryRepository: Repository<Subcategory>;
    private cloudinaryService: CloudinaryService;

    /**
     * Initializes repositories and the shared Cloudinary service.
     */
    constructor() {
        this.categoryRepository = AppDataSource.getRepository(Category);
        this.userRepository = AppDataSource.getRepository(User);
        this.subcategoryRepository = AppDataSource.getRepository(Subcategory);
        this.cloudinaryService = new CloudinaryService();
    }

    /**
     * Uploads a category image into the `categories` folder with the
     * category optimization preset applied.
     */
    private async uploadCategoryImageFile(file: Express.Multer.File): Promise<string> {
        const uploaded = await this.cloudinaryService.uploadSingleImage(file, 'categories');
        return uploaded.url;
    }

    /**
     * Deletes a previously stored category image. Log-and-continue: a CDN
     * outage must never block category CRUD (orphans are visible in the
     * console warning instead of being silently swallowed).
     * `skipIfEquals` guards the dedup case: identical content maps to the
     * same public ID, so deleting the old URL would destroy the freshly
     * uploaded replacement.
     */
    private async deleteStoredImage(
        url: string | null | undefined,
        skipIfEquals?: string,
    ): Promise<void> {
        if (!url || (skipIfEquals && url === skipIfEquals)) return;
        const result = await this.cloudinaryService.deleteByUrl(url);
        if (!result.success) {
            console.warn(`[CategoryService] Image cleanup failed for ${url}: ${result.error}`);
        }
    }

    /**
     * Uploads or replaces the image of an existing category.
     *
     * - Validates that the category exists.
     * - Uploads new image to Cloudinary.
     * - Deletes the previous image if present.
     *
     * @param categoryId {number} - ID of the category to update
     * @param file {Express.Multer.File} - Image file to upload
     * @returns {Promise<Category>} - Updated category with image URL
     * @throws {APIError} - If category not found or upload fails
     * @access Admin
     */
    async uploadCategoryImage(categoryId: number, file: Express.Multer.File): Promise<Category> {
        const category = await this.categoryRepository.findOne({ where: { id: categoryId } });
        if (!category) {
            throw new APIError(404, 'Category not found');
        }

        // Upload image to Cloudinary
        const uploadResult = await this.uploadCategoryImageFile(file);

        // Delete existing image if it exists
        await this.deleteStoredImage(category.image, uploadResult);

        // Update category image URL
        category.image = uploadResult;
        return await this.categoryRepository.save(category);
    }

    /**
     * Creates a new category for an admin user.
     * 
     * - Validates that the user is an admin.
     * - Optionally uploads an image to Cloudinary.
     * 
     * @param dto {CreateCategoryInput} - Data to create the category (e.g., name)
     * @param userId {number} - ID of the admin user
     * @param file {Express.Multer.File} [optional] - Optional image file
     * @returns {Promise<Category>} - The newly created category
     * @throws {APIError} - If user is not admin or upload fails
     * @access Admin
     */
    async createCategory(dto: CreateCategoryInput, userId: number, file?: Express.Multer.File): Promise<Category> {
        // Verify admin user
        const user = await this.userRepository.findOne({ where: { id: userId, role: UserRole.ADMIN } });
        if (!user) {
            throw new APIError(403, 'User not found or not an admin');
        }

        let imageUrl: string | undefined;

        // Upload image if provided
        if (file) {
            imageUrl = await this.uploadCategoryImageFile(file);
        }

        // Create category entity
        const category = this.categoryRepository.create({
            name: dto.name,
            createdBy: user,
            image: imageUrl,
            isAgeRestricted: dto.isAgeRestricted ?? false,
            minimumAge: dto.isAgeRestricted ? (dto.minimumAge ?? 18) : null,
            restrictionMessage: dto.isAgeRestricted ? (dto.restrictionMessage ?? null) : null,
        });

        return this.categoryRepository.save(category);
    }

    /**
     * Fetches a category by its name.
     *
     * @param name {string} - Name of the category to search
     * @returns {Promise<Category | null>} - Category if found, else null
     * @access Public
     */
    async getCategoryByName(name: string) {
        return this.categoryRepository.findOne({
            where: {
                name: name
            }
        });
    }

    /**
         * Searches for categories by partial name match (case-insensitive).
         * Includes subcategories and creator info.
         *
         * @param name {string} - Search term to match against category names
         * @returns {Promise<Category[]>} - List of matched categories
         * @throws {APIError} - If no categories are found
         * @access Public
         */
    async searchCategoryByName(name: string): Promise<Category[]> {
        const categories = await this.categoryRepository
            .createQueryBuilder('category')
            .leftJoinAndSelect('category.subcategories', 'subcategories')
            .leftJoinAndSelect('category.createdBy', 'createdBy')
            .where('category.name ILIKE :name', { name: `%${name}%` })
            .getMany();

        if (!categories.length) {
            throw new APIError(404, 'No categories found matching the search query');
        }
        return categories;
    }

    /**
     * Retrieves all categories with their subcategories and creator details.
     * 
     * @returns {Promise<Category[]>} - Array of all categories
     * @access Public
     */
    async getCategories(): Promise<Category[]> {
        return this.categoryRepository.find({ relations: ['subcategories'] });
    }

    /**
     * Retrieves a specific category by its ID, including subcategories and creator.
     * 
     * @param id {number} - ID of the category to retrieve
     * @returns {Promise<Category | null>} - Category if found, otherwise null
     * @access Public
     */
    async getCategoryById(id: number): Promise<Category | null> {
        return this.categoryRepository.findOne({
            where: { id },
            relations: ['subcategories'],
        });
    }

    /**
     * Updates a category’s name or image.
     *
     * - Requires admin privileges.
     * - Allows optional image replacement via Cloudinary.
     * - Deletes the old image if a new one is uploaded.
     * 
     * @param id {number} - ID of the category to update
     * @param dto {UpdateCategoryInput} - Update data (e.g., new name)
     * @param userId {number} - Admin user performing the update
     * @param file {Express.Multer.File} [optional] - Optional new image file
     * @returns {Promise<Category | null>} - Updated category if successful
     * @throws {APIError} - If user/category not found or image operations fail
     * @access Admin
     */
    async updateCategory(id: number, dto: UpdateCategoryInput, userId: number, file?: Express.Multer.File): Promise<Category | null> {
        const user = await this.userRepository.findOne({ where: { id: userId, role: UserRole.ADMIN } });
        if (!user) {
            throw new APIError(403, 'User not found or not an admin');
        }

        const category = await this.categoryRepository.findOne({ where: { id } });
        if (!category) {
            throw new APIError(404, 'Category not found');
        }

        let imageUrl: string | undefined = category.image;

        if (file) {
            // Upload new image first so a failed upload never leaves the
            // category without any image, then clean up the old asset.
            imageUrl = await this.uploadCategoryImageFile(file);
            await this.deleteStoredImage(category.image, imageUrl);
        }

        // Update fields
        await this.categoryRepository.update(id, {
            name: dto.name ?? category.name,
            image: imageUrl,
            ...(dto.isAgeRestricted === undefined ? {} : {
                isAgeRestricted: dto.isAgeRestricted,
                minimumAge: dto.isAgeRestricted ? (dto.minimumAge ?? 18) : null,
                restrictionMessage: dto.isAgeRestricted ? (dto.restrictionMessage ?? null) : null,
            }),
        });

        // Return updated category
        return this.categoryRepository.findOne({ where: { id }, relations: ['subcategories', 'createdBy'] });
    }

    /**
     * Deletes a category by ID.
     * 
     * - Only allowed for admin users.
     * - Ensures no subcategories are attached to the category.
     * - Deletes image from Cloudinary if exists.
     * 
     * @param id {number} - ID of the category to delete
     * @param userId {number} - Admin user performing the deletion
     * @returns {Promise<void>} - Resolves when deletion is complete
     * @throws {APIError | Error} - If unauthorized, category not found, or category has subcategories
     * @access Admin
     */
    async deleteCategory(id: number, userId: number): Promise<void> {
        const user = await this.userRepository.findOne({ where: { id: userId, role: UserRole.ADMIN } });
        if (!user) {
            throw new Error('User not found or not an admin');
        }

        const category = await this.categoryRepository.findOne({ where: { id } });
        if (!category) {
            throw new Error('Category not found');
        }

        const subcategoryCount = await this.subcategoryRepository.count({
            where: { category: { id } }
        });

        if (subcategoryCount > 0) {
            throw new APIError(409, 'Cannot delete category that contains subcategories. Please delete all subcategories first.');
        }

        await this.deleteStoredImage(category.image);

        await this.categoryRepository.delete(id);
    }
}
