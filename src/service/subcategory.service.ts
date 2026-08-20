import { Repository } from "typeorm";
import { Subcategory } from "../entities/subcategory.entity";
import { Category } from "../entities/category.entity";
import { User, UserRole } from "../entities/user.entity";
import AppDataSource from "../config/db.config";
import {
    CreateSubCategoryInput,
    UpdateSubCategoryInput,
} from "../utils/zod_validations/subcategory.zod";
import { APIError } from "../utils/ApiError.utils";
import { Product } from "../entities/product.entity";
import { CloudinaryService } from "./image.service";

/**
 * Service for managing subcategory-related operations.
 */
export class SubcategoryService {
    private subcategoryRepository: Repository<Subcategory>;
    private categoryRepository: Repository<Category>;
    private userRepository: Repository<User>;
    private productRepository: Repository<Product>;
    private cloudinaryService: CloudinaryService;

    /**
     * Initializes the service with subcategory, category, user, and product repositories.
     */
    constructor() {
        // Initialize repository to manage subcategories in DB
        this.subcategoryRepository = AppDataSource.getRepository(Subcategory);
        // Initialize repository to manage categories in DB
        this.categoryRepository = AppDataSource.getRepository(Category);
        // Initialize repository to manage users in DB (for admin checks)
        this.userRepository = AppDataSource.getRepository(User);
        // Initialize repository to manage products (for dependency checks)
        this.productRepository = AppDataSource.getRepository(Product);
        this.cloudinaryService = new CloudinaryService();
    }

    /**
     * Uploads a subcategory image into the `subcategories` folder with the
     * optimization preset applied.
     */
    private async uploadSubcategoryImageFile(
        file: Express.Multer.File,
    ): Promise<string> {
        const uploaded = await this.cloudinaryService.uploadSingleImage(
            file,
            "subcategories",
        );
        return uploaded.url;
    }

    /**
     * Deletes a stored image by URL, logging failures instead of throwing.
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
            console.warn(
                `[SubcategoryService] Image cleanup failed for ${url}: ${result.error}`,
            );
        }
    }

    /**
     * Uploads an image file to a specific subcategory under a category.
     * Deletes the previous image if one exists.
     * @param categoryId - Parent category ID
     * @param subcategoryId - Subcategory ID
     * @param file - Image file to upload
     * @returns Updated subcategory with new image URL
     * @throws APIError if subcategory not found or upload fails
     */
    async uploadSubcategoryImage(
        categoryId: number,
        subcategoryId: number,
        file: Express.Multer.File,
    ): Promise<Subcategory> {
        // Find subcategory by ID and category with relation
        const subcategory = await this.subcategoryRepository.findOne({
            where: { id: subcategoryId, category: { id: categoryId } },
            relations: ["category"],
        });
        if (!subcategory) {
            throw new APIError(
                404,
                "Subcategory not found in the specified category",
            );
        }

        // Upload new image first so a failed upload never leaves the
        // subcategory without any image.
        const uploadResult = await this.uploadSubcategoryImageFile(file);

        // If previous image exists, delete it from Cloudinary (skipped when
        // the replacement shares the same content-hash public ID).
        await this.deleteStoredImage(subcategory.image, uploadResult);

        // Update subcategory image URL
        subcategory.image = uploadResult;
        // Save updated subcategory and return
        return await this.subcategoryRepository.save(subcategory);
    }

    /**
     * Creates a new subcategory under a category by an admin user, optionally uploading an image.
     * @param dto - Data for new subcategory (name)
     * @param categoryId - Parent category ID
     * @param userId - User ID of creator (must be admin)
     * @param file - Optional image file for subcategory
     * @returns Created subcategory
     * @throws APIError if category or user/admin validation fails or image upload fails
     */
    async createSubcategory(
        dto: CreateSubCategoryInput,
        categoryId: number,
        userId: number,
        file?: Express.Multer.File,
    ): Promise<Subcategory> {
        // Check category existence
        const category = await this.categoryRepository.findOne({
            where: { id: categoryId },
        });
        if (!category) {
            throw new APIError(404, "Category not found");
        }

        // Check if user exists and is admin
        const user = await this.userRepository.findOne({
            where: { id: userId, role: UserRole.ADMIN },
        });
        if (!user) {
            throw new APIError(403, "User not found or not an admin");
        }

        // Optional image upload
        let imageUrl: string | undefined;
        if (file) {
            imageUrl = await this.uploadSubcategoryImageFile(file);
        }

        // Create subcategory entity with supplied data and image URL if any
        const subcategory = this.subcategoryRepository.create({
            name: dto.name,
            createdBy: user,
            category,
            image: imageUrl,
        });

        // Save subcategory to database
        return this.subcategoryRepository.save(subcategory);
    }

    /**
     * Finds a subcategory by its name.
     * @param name - Name of the subcategory
     * @returns The subcategory if found, else null
     */
    async getSubcategoryByName(name: string) {
        return this.subcategoryRepository.findOne({
            where: {
                name: name,
            },
        });
    }

    /**
     * Retrieves all subcategories under a specific category.
     * @param categoryId - Category ID
     * @returns Array of subcategories with relations loaded
     */
    async getSubcategories(categoryId: number): Promise<Subcategory[]> {
        // Fetch all subcategories that belong to a category
        return this.subcategoryRepository.find({
            where: { category: { id: categoryId } },
            relations: ["category"],
        });
    }

    /**
     * Retrieves a single subcategory by its ID and category ID.
     * @param id - Subcategory ID
     * @param categoryId - Category ID
     * @returns Subcategory with relations or null if not found
     */
    async getSubcategoryById(
        id: number,
        categoryId: number,
    ): Promise<Subcategory | null> {
        return this.subcategoryRepository.findOne({
            where: { id, category: { id: categoryId } },
            relations: ["category"],
        });
    }

    async handleGetSubcategoryById(id: number) {
        return this.subcategoryRepository.findOne({
            where: { id },
        });
    }

    /**
     * Updates an existing subcategory by an admin user, optionally replacing its image.
     * @param id - Subcategory ID
     * @param dto - Update data (name)
     * @param categoryId - Category ID
     * @param userId - User ID (admin)
     * @param file - Optional new image file
     * @returns Updated subcategory
     * @throws APIError if user not admin, subcategory not found, or image upload/delete fails
     */
    async updateSubcategory(
        id: number,
        dto: UpdateSubCategoryInput,
        categoryId: number,
        userId: number,
        file?: Express.Multer.File,
    ): Promise<Subcategory> {
        // Check if user is admin
        const user = await this.userRepository.findOne({
            where: { id: userId, role: UserRole.ADMIN },
        });
        if (!user) {
            throw new APIError(403, "User not found or not an admin");
        }

        // Find subcategory under the category
        const subcategory = await this.subcategoryRepository.findOne({
            where: {
                id,
                category: { id: categoryId },
            },
            relations: ["category"],
        });

        if (!subcategory) {
            throw new APIError(
                404,
                "Subcategory not found in the specified category",
            );
        }

        // Prepare image URL to keep existing if no new image uploaded
        let imageUrl: string | undefined = subcategory.image;

        if (file) {
            // Upload new image first so a failed upload never leaves the
            // subcategory without any image, then clean up the old asset.
            imageUrl = await this.uploadSubcategoryImageFile(file);
            await this.deleteStoredImage(subcategory.image, imageUrl);
        }

        // Update subcategory data
        await this.subcategoryRepository.update(id, {
            name: dto.name ?? subcategory.name,
            image: imageUrl,
        });

        // Fetch and return updated subcategory with relations
        const updatedSubcategory = await this.subcategoryRepository.findOne({
            where: { id },
            relations: ["category", "createdBy"],
        });

        if (!updatedSubcategory) {
            throw new APIError(500, "Failed to retrieve updated subcategory");
        }

        return updatedSubcategory;
    }

    /**
     * Deletes a subcategory by an admin user after ensuring it has no dependent products.
     * Also deletes the subcategory's image from Cloudinary if present.
     * @param id - Subcategory ID
     * @param categoryId - Category ID
     * @param userId - User ID (admin)
     * @throws APIError if user not admin, subcategory not found, or products exist, or image deletion fails
     */
    async deleteSubcategory(
        id: number,
        categoryId: number,
        userId: number,
    ): Promise<void> {
        // Verify user is admin
        const user = await this.userRepository.findOne({
            where: { id: userId, role: UserRole.ADMIN },
        });
        if (!user) {
            throw new APIError(403, "User not found or not an admin");
        }

        // Verify subcategory exists in the specified category
        const subcategory = await this.subcategoryRepository.findOne({
            where: { id, category: { id: categoryId } },
            relations: ["category"],
        });
        if (!subcategory) {
            throw new APIError(
                404,
                "Subcategory not found in the specified category",
            );
        }

        // Check if subcategory contains products
        const productCount = await this.productRepository.count({
            where: { subcategory: { id } },
        });

        if (productCount > 0) {
            throw new APIError(
                409,
                "Cannot delete subcategory that contains products. Please delete all products first.",
            );
        }

        // Delete subcategory image from Cloudinary if exists
        await this.deleteStoredImage(subcategory.image);

        // Delete the subcategory entity from the database
        await this.subcategoryRepository.delete(id);
    }
}
