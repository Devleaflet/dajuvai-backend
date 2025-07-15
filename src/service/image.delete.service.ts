import { v2 as cloudinary } from 'cloudinary';
import { APIError } from '../utils/ApiError.utils';

export interface ImageDeletionResult {
    publicId: string;
    success: boolean;
    error?: string;
}


/**
 * Service for deleting images from Cloudinary by their URLs.
 * Supports deletion of single or multiple images with validation
 * and error handling.
 * 
 * Module: Cloudinary Image Management
 */

export class ImageDeletionService {
    /**
     * Initializes Cloudinary SDK with environment variables and validates config.
     * @throws {APIError} If required Cloudinary config variables are missing.
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
     * Validates that all required Cloudinary environment variables are set.
     * @throws {APIError} If any required environment variables are missing.
     */
    private validateCloudinaryConfig(): void {
        const requiredEnvVars = ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
        const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

        if (missingVars.length > 0) {
            throw new APIError(500, `Missing Cloudinary configuration: ${missingVars.join(', ')}`);
        }
    }

    /**
     * Extracts the Cloudinary public ID from a full image URL.
     * Supports nested folder paths in the URL.
     * 
     * @param url {string} - Full Cloudinary image URL
     * @returns {string} Extracted public ID used by Cloudinary
     * @throws {APIError} If the URL format is invalid
     */
    private extractPublicIdFromUrl(url: string): string {
        try {
            const urlParts = url.split('/');
            const fileWithExtension = urlParts[urlParts.length - 1];
            const publicId = fileWithExtension.split('.')[0];

            // Include folder path if present in URL after "upload"
            const folderIndex = urlParts.findIndex(part => part === 'upload');
            if (folderIndex !== -1 && folderIndex < urlParts.length - 2) {
                const folderPath = urlParts.slice(folderIndex + 2, -1).join('/');
                return folderPath ? `${folderPath}/${publicId}` : publicId;
            }

            return publicId;
        } catch (error) {
            console.error('Error extracting public ID from URL:', error);
            throw new APIError(400, 'Invalid Cloudinary URL format');
        }
    }

    /**
     * Validates an array of image URLs to ensure they are non-empty,
     * from Cloudinary domain, and within the allowed limit (max 5).
     * 
     * @param urls {string[]} - Array of image URLs to validate
     * @throws {APIError} If no URLs provided, too many URLs, or invalid URL detected
     */
    private validateImageUrls(urls: string[]): void {
        if (!urls || urls.length === 0) {
            throw new APIError(400, 'No image URLs provided for deletion');
        }

        if (urls.length > 5) {
            throw new APIError(400, `Too many images: ${urls.length}. Maximum allowed: 5`);
        }

        urls.forEach((url, index) => {
            if (!url || typeof url !== 'string' || !url.includes('cloudinary.com')) {
                throw new APIError(400, `Invalid URL at index ${index + 1}: ${url}`);
            }
        });
    }

    /**
     * Deletes a single image from Cloudinary by URL.
     * 
     * @param imageUrl {string} - Full URL of the image to delete
     * @returns {Promise<ImageDeletionResult>} Result object indicating success or failure
     * @throws {APIError} If validation fails or deletion encounters error
     * @access Admin
     */
    async deleteSingleImage(imageUrl: string): Promise<ImageDeletionResult> {
        try {
            this.validateImageUrls([imageUrl]);
            const publicId = this.extractPublicIdFromUrl(imageUrl);

            console.log(`Deleting single image: ${publicId}`);

            const result = await cloudinary.uploader.destroy(publicId, {
                resource_type: 'image',
                invalidate: true,
            });

            if (result.result === 'ok') {
                console.log(`✓ Image deleted successfully: ${publicId}`);
                return {
                    publicId,
                    success: true,
                };
            } else {
                console.warn(`Image deletion failed: ${publicId}, result: ${result.result}`);
                return {
                    publicId,
                    success: false,
                    error: `Deletion failed: ${result.result}`,
                };
            }
        } catch (error) {
            console.error(`Error deleting image ${imageUrl}:`, error);
            throw error instanceof APIError
                ? error
                : new APIError(500, `Failed to delete image: ${error.message}`);
        }
    }

    /**
     * Deletes multiple images from Cloudinary by their URLs.
     * Accepts up to 5 images per request.
     * 
     * @param imageUrls {string[]} - Array of full image URLs to delete
     * @returns {Promise<ImageDeletionResult[]>} Array of results for each deletion attempt
     * @throws {APIError} If validation fails or a critical error occurs
     * @access Admin
     */
    async deleteMultipleImages(imageUrls: string[]): Promise<ImageDeletionResult[]> {
        try {
            this.validateImageUrls(imageUrls);

            console.log(`Deleting ${imageUrls.length} images...`);

            const deletionPromises = imageUrls.map(async (url, index) => {
                try {
                    const publicId = this.extractPublicIdFromUrl(url);
                    console.log(`Deleting image ${index + 1}/${imageUrls.length}: ${publicId}`);

                    const result = await cloudinary.uploader.destroy(publicId, {
                        resource_type: 'image',
                        invalidate: true,
                    });

                    if (result.result === 'ok') {
                        console.log(`✓ Image deleted successfully: ${publicId}`);
                        return {
                            publicId,
                            success: true,
                        };
                    } else {
                        console.warn(`Image deletion failed: ${publicId}, result: ${result.result}`);
                        return {
                            publicId,
                            success: false,
                            error: `Deletion failed: ${result.result}`,
                        };
                    }
                } catch (error) {
                    console.error(`Error deleting image ${url}:`, error);
                    return {
                        publicId: this.extractPublicIdFromUrl(url),
                        success: false,
                        error: error.message || 'Deletion failed',
                    };
                }
            });

            const results = await Promise.all(deletionPromises);
            console.log(`✓ Completed deletion of ${imageUrls.length} images`);

            return results;
        } catch (error) {
            console.error('Multiple images deletion failed:', error);
            throw error instanceof APIError
                ? error
                : new APIError(500, 'Multiple images deletion service error');
        }
    }
}
