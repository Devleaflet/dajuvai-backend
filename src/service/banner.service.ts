import { ILike, Repository } from 'typeorm';
import { Banner, BannerStatus } from '../entities/banner.entity';
import AppDataSource from '../config/db.config';
import { v2 as cloudinary } from 'cloudinary';
import { CreateBannerInput, UpdateBannerInput } from '../utils/zod_validations/banner.zod';
import { APIError } from '../utils/ApiError.utils';
import cron from 'node-cron';



/**
 * BannerService handles all banner-related business logic.
 * This includes CRUD operations, Cloudinary image handling,
 * automatic status updates using a cron job, and search.
 * 
 * @module Services/Banner
 */
export class BannerService {
    private bannerRepository: Repository<Banner>;

    /**
     * Constructor initializes the repository and sets up Cloudinary configuration and cron jobs.
     */
    constructor() {
        this.bannerRepository = AppDataSource.getRepository(Banner);

        // Configure Cloudinary using environment variables
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });

        // Schedule cron job to auto-update banner statuses every 5 hours
        cron.schedule('0 */5 * * *', async () => {
            await this.updateBannerStatuses();
        });
    }

    /**
     * Create a new banner with image upload to Cloudinary.
     * 
     * @param dto {CreateBannerInput} - DTO containing banner fields
     * @param file {Express.Multer.File} - Image file to be uploaded
     * @param adminId {number} - ID of the admin creating the banner
     * @returns {Promise<Banner>} - Created Banner entity
     * @throws {APIError} - If image is missing, duplicate name exists, or upload fails
     * @access Admin
     */
    async createBanner(dto: CreateBannerInput, desktopFile: Express.Multer.File, mobileFile: Express.Multer.File, adminId: number): Promise<Banner> {
        if (!desktopFile || !mobileFile) {
            throw new APIError(400, 'Both desktop and mobile banner images are required');
        }

        const exists = await this.bannerRepository.findOne({ where: { name: dto.name } });
        if (exists) {
            throw new APIError(409, 'Banner with this name already exists');
        }

        const uploadToCloudinary = (file: Express.Multer.File) => {
            return new Promise<string>((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { resource_type: 'image' },
                    (error, result) => {
                        if (error || !result) {
                            reject(new APIError(500, 'Image upload failed'));
                        } else {
                            resolve(result.secure_url);
                        }
                    }
                ).end(file.buffer);
            });
        };

        const [desktopImageUrl, mobileImageUrl] = await Promise.all([
            uploadToCloudinary(desktopFile),
            uploadToCloudinary(mobileFile),
        ]);

        const status = this.determineStatus(new Date(dto.startDate), new Date(dto.endDate));

        const banner = this.bannerRepository.create({
            ...dto,
            desktopImage: desktopImageUrl,
            mobileImage: mobileImageUrl,
            status,
            startDate: new Date(dto.startDate),
            endDate: new Date(dto.endDate),
            createdById: adminId,
        });

        return await this.bannerRepository.save(banner);
    }

    /**
 * Update an existing banner by its ID.
 * Supports optional image replacement using Cloudinary.
 * 
 * @param id {number} - ID of the banner to update
 * @param dto {UpdateBannerInput} - DTO containing updatable fields
 * @param file {Express.Multer.File} [optional] - New image file (if provided)
 * @param adminId {number} [optional] - Admin ID performing the update
 * @returns {Promise<Banner>} - Updated banner entity
 * @throws {APIError} - If banner is not found, image upload fails, or other update errors occur
 * @access Admin
 */
    async updateBanner(
        id: number,
        dto: UpdateBannerInput,
        desktopFile?: Express.Multer.File,
        mobileFile?: Express.Multer.File,
        adminId?: number
    ): Promise<Banner> {
        const banner = await this.bannerRepository.findOne({ where: { id } });

        if (!banner) {
            throw new APIError(404, 'Banner not found');
        }

        let desktopImage = banner.desktopImage;
        let mobileImage = banner.mobileImage;

        const uploadToCloudinary = (file: Express.Multer.File) => {
            return new Promise<string>((resolve, reject) => {
                cloudinary.uploader.upload_stream(
                    { resource_type: 'image' },
                    (error, result) => {
                        if (error || !result) {
                            reject(new APIError(500, 'Image upload failed'));
                        } else {
                            resolve(result.secure_url);
                        }
                    }
                ).end(file.buffer);
            });
        };

        // If new desktop image is provided
        if (desktopFile) {
            if (banner.desktopImage) {
                const publicId = banner.desktopImage.split('/').pop()?.split('.')[0] || '';
                await cloudinary.uploader.destroy(publicId);
            }
            desktopImage = await uploadToCloudinary(desktopFile);
        }

        // If new mobile image is provided
        if (mobileFile) {
            if (banner.mobileImage) {
                const publicId = banner.mobileImage.split('/').pop()?.split('.')[0] || '';
                await cloudinary.uploader.destroy(publicId);
            }
            mobileImage = await uploadToCloudinary(mobileFile);
        }

        const updatedData = {
            ...dto,
            desktopImage,
            mobileImage,
            startDate: dto.startDate ? new Date(dto.startDate) : banner.startDate,
            endDate: dto.endDate ? new Date(dto.endDate) : banner.endDate,
            status: dto.status || this.determineStatus(
                dto.startDate ? new Date(dto.startDate) : banner.startDate,
                dto.endDate ? new Date(dto.endDate) : banner.endDate
            ),
            createdById: adminId || banner.createdById,
        };

        await this.bannerRepository.update(id, updatedData);
        return await this.bannerRepository.findOneOrFail({ where: { id } });
    }


    /**
  * Fetch a single banner by its ID including its creator.
  *
  * @param id {number} - The ID of the banner to fetch
  * @returns {Promise<Banner>} - The found banner with creator relation
  * @throws {APIError} - If the banner is not found
  * @access Admin
  */
    async getBannerById(id: number): Promise<Banner> {
        const banner = await this.bannerRepository.findOne({ where: { id }, relations: ['createdBy', 'products'] });

        if (!banner) {
            throw new APIError(404, 'Banner not found');
        }

        return banner;
    }

    /**
     * Fetch all banners including the creator of each banner.
     *
     * @returns {Promise<Banner[]>} - List of all banners with creator relation
     * @access Admin
     */
    async getAllBanners(): Promise<Banner[]> {
        return await this.bannerRepository.find({ relations: ['createdBy'] });
    }

    /**
     * Determine the status of a banner based on start and end dates.
     *
     * @param startDate {Date} - Banner's start date
     * @param endDate {Date} - Banner's end date
     * @returns {BannerStatus} - One of: SCHEDULED, ACTIVE, or EXPIRED
     * @access Internal
     */
    private determineStatus(startDate: Date, endDate: Date): BannerStatus {
        const now = new Date();

        if (now < startDate) {
            return BannerStatus.SCHEDULED;
        } else if (now >= startDate && now <= endDate) {
            return BannerStatus.ACTIVE;
        } else {
            return BannerStatus.EXPIRED;
        }
    }

    /**
     * Automatically update statuses of all banners based on current date.
     * This method is triggered by a cron job every 5 hours.
     *
     * @returns {Promise<void>}
     * @access Internal (Cron job)
     */
    async updateBannerStatuses(): Promise<void> {
        const banners = await this.bannerRepository.find();

        for (const banner of banners) {
            const newStatus = this.determineStatus(banner.startDate, banner.endDate);

            if (newStatus !== banner.status) {
                await this.bannerRepository.update(banner.id, { status: newStatus });
            }
        }
    }

    /**
     * Delete a banner by its ID.
     *
     * @param id {number} - The ID of the banner to delete
     * @returns {Promise<DeleteResult>} - TypeORM delete result
     * @access Admin
     */
    async deleteBanner(id: number) {
        return await this.bannerRepository.delete(id);
    }

    /**
     * Search banners by name using case-insensitive partial match.
     *
     * @param name {string} - The name (or part of it) to search
     * @returns {Promise<Banner[]>} - List of matching banners
     * @throws {APIError} - If database error occurs during search
     * @access Admin
     */
    async searchBannersByName(name: string): Promise<Banner[]> {
        try {
            return await this.bannerRepository.find({
                where: {
                    name: ILike(`%${name}%`)
                },
                relations: ['createdBy'],
            });
        } catch (err) {
            console.error("DB error in searchBannersByName:", err);
            throw new APIError(500, "Database error during banner search");
        }
    }
}
