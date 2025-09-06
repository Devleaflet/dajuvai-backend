import { Repository } from 'typeorm';
import { Category } from '../entities/category.entity';
import { User, UserRole } from '../entities/user.entity';
import { CreateCategoryInput, UpdateCategoryInput } from '../utils/zod_validations/category.zod';
import AppDataSource from '../config/db.config';
import { v2 as cloudinary } from 'cloudinary';
import { APIError } from '../utils/ApiError.utils';
import { Subcategory } from '../entities/subcategory.entity';
/**
 * Service for managing category-related operations.
 * 
 * Module: Category Management (Admin)
 */
export class CategoryService {
    private categoryRepository: Repository<Category>;
    private userRepository: Repository<User>;
    private subcategoryRepository: Repository<Subcategory>;

    /**
     * Initializes repositories and configures Cloudinary.
     */
    constructor() {
        this.categoryRepository = AppDataSource.getRepository(Category);
        this.userRepository = AppDataSource.getRepository(User);
        this.subcategoryRepository = AppDataSource.getRepository(Subcategory);

        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });
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
        const uploadResult = await new Promise<string>((resolve, reject) => {
            cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                if (error || !result) reject(new APIError(500, 'Image upload failed'));
                else resolve(result.secure_url);
            }).end(file.buffer);
        });

        // Delete existing image if it exists
        if (category.image) {
            const publicId = category.image.split('/').pop()?.split('.')[0] || '';
            await cloudinary.uploader.destroy(publicId);
        }

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
            imageUrl = await new Promise<string>((resolve, reject) => {
                cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                    if (error || !result) reject(new APIError(500, 'Image upload failed'));
                    else resolve(result.secure_url);
                }).end(file.buffer);
            });
        }

        // Create category entity
        const category = this.categoryRepository.create({
            name: dto.name,
            createdBy: user,
            image: imageUrl,
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
            // Delete existing image from Cloudinary
            if (category.image) {
                const publicId = category.image.split('/').pop()?.split('.')[0] || '';
                await cloudinary.uploader.destroy(publicId).catch(() => {
                    throw new APIError(500, 'Failed to delete existing image');
                });
            }

            // Upload new image
            imageUrl = await new Promise<string>((resolve, reject) => {
                cloudinary.uploader.upload_stream({ resource_type: 'image' }, (error, result) => {
                    if (error || !result) reject(new APIError(500, 'Image upload failed'));
                    else resolve(result.secure_url);
                }).end(file.buffer);
            });
        }

        // Update fields
        await this.categoryRepository.update(id, {
            name: dto.name ?? category.name,
            image: imageUrl,
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

        if (category.image) {
            const publicId = category.image.split('/').pop()?.split('.')[0] || '';
            await cloudinary.uploader.destroy(publicId).catch(() => {
                throw new APIError(500, 'Failed to delete category image');
            });
        }

        await this.categoryRepository.delete(id);
    }
}