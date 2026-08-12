import { v2 as cloudinary } from "cloudinary";
import config from "../config/env.config";
import { APIError } from "../errors/ApiError";
import {
    validateUploadFile,
    validateUploadFolder,
} from "./upload.validation";

export interface UploadedFile {
    url: string;
    publicId: string;
    resourceType: string;
}

export class ImageService {
    constructor() {
        cloudinary.config({
            cloud_name: config.CLOUDINARY_CLOUD_NAME,
            api_key: config.CLOUDINARY_API_KEY,
            api_secret: config.CLOUDINARY_API_SECRET,
        });
    }

    private ensureCloudinaryConfigured(): void {
        const missing = [
            ["CLOUDINARY_CLOUD_NAME", config.CLOUDINARY_CLOUD_NAME],
            ["CLOUDINARY_API_KEY", config.CLOUDINARY_API_KEY],
            ["CLOUDINARY_API_SECRET", config.CLOUDINARY_API_SECRET],
        ]
            .filter(([, value]) => !value)
            .map(([name]) => name);

        if (missing.length > 0) {
            throw new APIError(
                503,
                "File upload service is not configured",
                "UPLOAD_SERVICE_UNAVAILABLE",
            );
        }
    }

    private storageError(): APIError {
        return new APIError(
            502,
            "File storage upload failed",
            "UPLOAD_STORAGE_ERROR",
        );
    }

    private getRawPublicId(file: Express.Multer.File, extension: string): string {
        const baseName = (file.originalname ?? "upload")
            .replace(/\.[^/.]+$/, "")
            .replace(/[^a-zA-Z0-9_-]/g, "_")
            .slice(0, 80) || "upload";
        return `${baseName}_${Date.now()}.${extension}`;
    }

    async uploadSingleImage(
        file: Express.Multer.File,
        folderName: string | undefined,
    ): Promise<UploadedFile> {
        const folder = validateUploadFolder(folderName);
        const validated = validateUploadFile(file);
        this.ensureCloudinaryConfigured();

        const uploadOptions: Record<string, unknown> = {
            folder,
            resource_type: validated.resourceType,
        };

        if (validated.resourceType === "raw") {
            uploadOptions.public_id = this.getRawPublicId(file, validated.extension);
        }

        const result = await new Promise<any>((resolve, reject) => {
            try {
                cloudinary.uploader
                    .upload_stream(uploadOptions, (error, uploadResult) => {
                        if (error || !uploadResult) return reject(this.storageError());
                        resolve(uploadResult);
                    })
                    .end(file.buffer);
            } catch {
                reject(this.storageError());
            }
        });

        if (!result.secure_url || !result.public_id) {
            throw this.storageError();
        }

        return {
            url: result.secure_url,
            publicId: result.public_id,
            resourceType: result.resource_type ?? validated.resourceType,
        };
    }

    async uploadMultipleImage(
        folderName: string,
        files: Express.Multer.File[],
    ): Promise<{ url: string; public_id: string }[]> {
        try {
            if (!files || files.length === 0)
                throw new Error("No files provided");

            const uploadPromises = files.map((file) =>
                cloudinary.uploader.upload(file.path, {
                    folder: folderName,
                    resource_type: "auto",
                }),
            );

            const results = await Promise.all(uploadPromises);

            return results.map((result) => ({
                url: result.secure_url,
                public_id: result.public_id,
            }));
        } catch (error) {
            throw new Error(
                "Cloudinary multiple upload failed: " + error.message,
            );
        }
    }

    async deleteImageByUrl(url: string): Promise<void> {
        try {
            const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z]+$/);
            if (!matches || !matches[1]) {
                console.warn(
                    `[ImageService] Could not parse public_id from URL: ${url}`,
                );
                return;
            }
            const publicId = matches[1];
            const result = await cloudinary.uploader.destroy(publicId);
            console.log(`[ImageService] Deleted image ${publicId}:`, result);
        } catch (error) {
            console.error(
                `[ImageService] Failed to delete image at ${url}:`,
                error,
            );
        }
    }

    async deleteImagesByUrls(urls: string[]): Promise<void> {
        await Promise.all(urls.map((url) => this.deleteImageByUrl(url)));
    }
}
