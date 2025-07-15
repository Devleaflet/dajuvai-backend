import { v2 as cloudinary } from 'cloudinary';
import { APIError } from '../utils/ApiError.utils';


/**
 * Options for uploading images to Cloudinary.
 */
export interface ImageUploadOptions {
    folder?: string;
    width?: number;
    height?: number;
    quality?: string | number;
    format?: string;
    crop?: string;
    publicIdPrefix?: string;
}


/**
 * Result information from an uploaded image.
 */
export interface ImageUploadResult {
    url: string;
    publicId: string;
    width: number;
    height: number;
    format: string;
    bytes: number;
}


/**
 * Service class for handling image uploads, deletions, and utility functions
 * with Cloudinary.
 * 
 * Responsible for:
 * - Validating files before upload
 * - Uploading single and multiple images with transformations
 * - Deleting images by public ID
 * - Extracting public IDs from Cloudinary URLs
 * 
 * This service requires Cloudinary credentials configured in environment variables:
 * CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.
 */
export class ImageUploadService {

    /**
    * Initializes and configures Cloudinary SDK with environment credentials.
    * Throws an error if any required environment variable is missing.
    */
    constructor() {
        // Configure Cloudinary
        cloudinary.config({
            cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
            api_key: process.env.CLOUDINARY_API_KEY,
            api_secret: process.env.CLOUDINARY_API_SECRET,
        });

        this.validateCloudinaryConfig();
    }


    /**
     * Validates that Cloudinary environment variables are set.
     * @throws {Error} When any required env var is missing.
     * @private
     */
    private validateCloudinaryConfig(): void {
        const requiredEnvVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingVars.length > 0) {
            throw new Error(`Missing Cloudinary configuration: ${missingVars.join(', ')}`);
        }
    }


    /**
    * Validates a file for correct mimetype, presence of buffer, and size limits.
    * @param {Express.Multer.File} file - The file object to validate.
    * @throws {APIError} If file is invalid, has disallowed mimetype, or is too large.
    * @private
    */
    private validateFile(file: Express.Multer.File): void {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
        const maxSize = 5 * 1024 * 1024; // 5MB

        if (!file.buffer) {
            throw new APIError(400, 'Invalid file: No buffer found. Use memory storage with multer.');
        }

        if (!allowedTypes.includes(file.mimetype)) {
            throw new APIError(400, `Invalid file type: ${file.mimetype}. Allowed types: ${allowedTypes.join(', ')}`);
        }

        if (file.size > maxSize) {
            throw new APIError(400, `File size exceeds limit: ${file.size} bytes. Maximum allowed: ${maxSize} bytes`);
        }
    }

    /**
      * Upload a single image to Cloudinary with optional transformations.
      * @param {Express.Multer.File} file - Image file to upload.
      * @param {ImageUploadOptions} [options={}] - Optional upload configuration.
      * @returns {Promise<ImageUploadResult>} Uploaded image details including URL and metadata.
      * @throws {APIError} When validation or upload fails.
      */
    async uploadSingleImage(
        file: Express.Multer.File,
        options: ImageUploadOptions = {}
    ): Promise<ImageUploadResult> {
        try {

            // Validate file type, size, buffer
            this.validateFile(file);


            // Destructure options with defaults
            const {
                folder = 'uploads',
                width = 1200,
                height = 1200,
                quality = 'auto',
                format = 'jpg',
                crop = 'limit',
                publicIdPrefix = 'img'
            } = options;

            console.log(`Uploading single image: ${file.originalname}`);

            // Use Promise to wrap cloudinary's upload_stream
            const result = await new Promise<any>((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        resource_type: 'image',
                        folder,
                        // Generate a unique public ID using prefix + timestamp + random number
                        public_id: `${publicIdPrefix}_${Date.now()}_${Math.round(Math.random() * 1000)}`,
                        transformation: [
                            { width, height, crop, quality }
                        ],
                        format,
                        overwrite: true,
                        invalidate: true
                    },
                    (error, result) => {
                        if (error) {
                            // Log and reject with APIError on upload failure
                            console.error(`Cloudinary upload error for ${file.originalname}:`, error);
                            reject(new APIError(500, `Image upload failed: ${error.message}`));
                        } else if (!result) {
                            reject(new APIError(500, 'Image upload failed: No result returned'));
                        } else {
                            // Resolve with Cloudinary upload result
                            resolve(result);
                        }
                    }
                );
                // End the stream with the file buffer
                uploadStream.end(file.buffer);
            });

            console.log(`✓ Single image uploaded successfully: ${result.secure_url}`);

            // Return formatted result
            return {
                url: result.secure_url,
                publicId: result.public_id,
                width: result.width,
                height: result.height,
                format: result.format,
                bytes: result.bytes
            };

        } catch (error) {
            console.error('Single image upload failed:', error);
            // Re-throw known APIErrors, else wrap in generic APIError
            throw error instanceof APIError ? error : new APIError(500, 'Image upload service error');
        }
    }



    /**
     * Upload multiple images (up to 5) to Cloudinary in parallel with optional transformations.
     * Validates all files before uploading.
     * @param {Express.Multer.File[]} files - Array of image files to upload.
     * @param {ImageUploadOptions} [options={}] - Optional upload configuration.
     * @returns {Promise<ImageUploadResult[]>} Array of uploaded image details.
     * @throws {APIError} If no files provided, too many files, validation or upload failure occurs.
     */
    async uploadMultipleImages(
        files: Express.Multer.File[],
        options: ImageUploadOptions = {}
    ): Promise<ImageUploadResult[]> {
        try {

            if (!files || files.length === 0) {
                throw new APIError(400, 'No files provided for upload');
            }

            // Limit max 5 files per upload to avoid abuse or performance issues
            if (files.length > 5) {
                throw new APIError(400, `Too many files: ${files.length}. Maximum allowed: 5`);
            }

            // Destructure options with defaults
            const {
                folder = 'uploads',
                width = 1200,
                height = 1200,
                quality = 'auto',
                format = 'jpg',
                crop = 'limit',
                publicIdPrefix = 'img'
            } = options;

            console.log(`Uploading ${files.length} images...`);


            // Validate each file before starting uploads
            files.forEach((file, index) => {
                try {
                    this.validateFile(file);
                } catch (error) {
                    throw new APIError(400, `File ${index + 1} (${file.originalname}): ${error.message}`);
                }
            });

            // Create an array of upload promises for all files
            const uploadPromises = files.map((file, index) =>
                new Promise<ImageUploadResult>((resolve, reject) => {
                    console.log(`Uploading file ${index + 1}/${files.length}: ${file.originalname}`);

                    const uploadStream = cloudinary.uploader.upload_stream(
                        {
                            resource_type: 'image',
                            folder,
                            // Include index in public_id for uniqueness among multiple files
                            public_id: `${publicIdPrefix}_${Date.now()}_${index}_${Math.round(Math.random() * 1000)}`,
                            transformation: [
                                { width, height, crop, quality }
                            ],
                            format,
                            overwrite: true,
                            invalidate: true
                        },
                        (error, result) => {
                            if (error) {
                                console.error(`Upload error for ${file.originalname}:`, error);
                                reject(new APIError(500, `Upload failed for ${file.originalname}: ${error.message}`));
                            } else if (!result) {
                                reject(new APIError(500, `Upload failed for ${file.originalname}: No result returned`));
                            } else {
                                console.log(`✓ File ${index + 1} uploaded: ${file.originalname} -> ${result.secure_url}`);
                                resolve({
                                    url: result.secure_url,
                                    publicId: result.public_id,
                                    width: result.width,
                                    height: result.height,
                                    format: result.format,
                                    bytes: result.bytes
                                });
                            }
                        }
                    );

                    uploadStream.end(file.buffer);
                })
            );

            // Await all uploads concurrently
            const results = await Promise.all(uploadPromises);
            console.log(`✓ Successfully uploaded ${results.length} images`);

            return results;

        } catch (error) {
            console.error('Multiple images upload failed:', error);
            throw error instanceof APIError ? error : new APIError(500, 'Multiple images upload service error');
        }
    }

    /**
    * Deletes a single image from Cloudinary by its public ID.
    * @param {string} publicId - Cloudinary public ID of the image to delete.
    * @returns {Promise<boolean>} True if deletion was successful, false otherwise.
    */
    async deleteImage(publicId: string): Promise<boolean> {
        try {
            console.log(`Deleting image: ${publicId}`);

            const result = await cloudinary.uploader.destroy(publicId);

            // Cloudinary returns 'ok' if deletion succeeded
            if (result.result === 'ok') {
                console.log(`✓ Image deleted successfully: ${publicId}`);
                return true;
            } else {
                console.warn(`Image deletion failed: ${publicId}, result: ${result.result}`);
                return false;
            }
        } catch (error) {
            console.error(`Error deleting image ${publicId}:`, error);
            return false;
        }
    }

    /**
     * Deletes multiple images from Cloudinary by their public IDs.
     * @param {string[]} publicIds - Array of Cloudinary public IDs to delete.
     * @returns {Promise<{ deleted: string[], failed: string[] }>} Object containing arrays of successfully deleted and failed public IDs.
     */
    async deleteMultipleImages(publicIds: string[]): Promise<{ deleted: string[], failed: string[] }> {
        // Map to array of promises that resolve to object with success flag
        const deletePromises = publicIds.map(async (publicId) => {
            const success = await this.deleteImage(publicId);
            return { publicId, success };
        });

        // Await all deletions (settled so all promises finish even if some fail)
        const results = await Promise.allSettled(deletePromises);
        const deleted: string[] = [];
        const failed: string[] = [];

        // Categorize deleted vs failed based on promise results
        results.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value.success) {
                deleted.push(result.value.publicId);
            } else {
                failed.push(publicIds[index]);
            }
        });

        return { deleted, failed };
    }

    /**
     * Extracts the Cloudinary public ID from a Cloudinary image URL.
     * Handles URLs with folder paths.
     * @param {string} url - The Cloudinary URL to extract the public ID from.
     * @returns {string | null} The extracted public ID or null if extraction fails.
     */
    extractPublicIdFromUrl(url: string): string | null {
        try {
            const urlParts = url.split('/');
            const fileWithExtension = urlParts[urlParts.length - 1];
            const publicId = fileWithExtension.split('.')[0]; // Remove file extension

            // Find index of "upload" segment to get folder path if any
            const folderIndex = urlParts.findIndex(part => part === 'upload');
            if (folderIndex !== -1 && folderIndex < urlParts.length - 2) {
                // Extract folder path between 'upload' and filename
                const folderPath = urlParts.slice(folderIndex + 2, -1).join('/');
                return folderPath ? `${folderPath}/${publicId}` : publicId;
            }

            // Return just publicId if no folder path
            return publicId;
        } catch (error) {
            console.error('Error extracting public ID from URL:', error);
            return null;
        }
    }
}