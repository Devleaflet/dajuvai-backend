import crypto from "crypto";
import cloudinary from "../config/cloudinary.config";
import config from "../config/env.config";
import { APIError } from "../errors/ApiError";
import {
    validateUploadFile,
    validateUploadFolder,
} from "./upload.validation";
import {
    extractCloudinaryPublicId,
    getUploadTransform,
} from "../utils/cloudinary.util";

export interface UploadedFile {
    url: string;
    publicId: string;
    resourceType: string;
}

export interface ImageDeletionResult {
    publicId: string;
    success: boolean;
    error?: string;
}

/**
 * The single Cloudinary service (spec OPT-3): uploads with per-folder
 * optimization presets, content-hash public IDs (dedup, OPT-6/OPT-12),
 * and folder-aware deletion with CDN invalidation (BUG-2/BUG-7/OPT-9).
 * Replaces ImageService + ImageUploadService + ImageDeletionService.
 */
export class CloudinaryService {
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

    /** Content hash → deterministic public ID: identical bytes always map
     * to the same asset, so re-uploads overwrite instead of duplicating. */
    private contentPublicId(file: Express.Multer.File, extension?: string): string {
        const hash = crypto
            .createHash("sha256")
            .update(file.buffer)
            .digest("hex")
            .slice(0, 20);
        return extension ? `${hash}.${extension}` : hash;
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
            // Same content → same ID → no duplicate assets (dedup).
            public_id: this.contentPublicId(
                file,
                validated.resourceType === "raw" ? validated.extension : undefined,
            ),
            overwrite: true,
            invalidate: true,
        };

        // Optimization presets apply to images only; documents store as-is.
        if (validated.resourceType === "image") {
            const preset = getUploadTransform(folder);
            if (preset) {
                uploadOptions.transformation = [preset];
            }
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

    /** Sequential uploads: avoids Cloudinary rate limits and gives each
     * file its own deterministic public ID (fixes the prod_${Date.now()}
     * collision in the old product controller, spec BUG-1). */
    async uploadMultipleImages(
        files: Express.Multer.File[],
        folderName: string | undefined,
    ): Promise<UploadedFile[]> {
        if (!files || files.length === 0) {
            throw new APIError(400, "No files provided", "UPLOAD_NO_FILES");
        }
        const results: UploadedFile[] = [];
        for (const file of files) {
            results.push(await this.uploadSingleImage(file, folderName));
        }
        return results;
    }

    async deleteByPublicId(publicId: string): Promise<ImageDeletionResult> {
        try {
            const result = await cloudinary.uploader.destroy(publicId, {
                resource_type: "image",
                invalidate: true,
            });
            if (result.result === "ok") {
                return { publicId, success: true };
            }
            return {
                publicId,
                success: false,
                error: `Deletion failed: ${result.result}`,
            };
        } catch (error) {
            return {
                publicId,
                success: false,
                error: error instanceof Error ? error.message : "Deletion failed",
            };
        }
    }

    /** Folder-aware public ID extraction + CDN invalidation. Never throws:
     * callers decide whether a failed cleanup should abort their flow. */
    async deleteByUrl(url: string): Promise<ImageDeletionResult> {
        if (!url || !url.includes("cloudinary.com")) {
            return { publicId: "", success: false, error: "Not a Cloudinary URL" };
        }
        const publicId = extractCloudinaryPublicId(url);
        if (!publicId) {
            console.warn(`[CloudinaryService] Could not parse public_id from URL: ${url}`);
            return { publicId: "", success: false, error: "Unparseable Cloudinary URL" };
        }
        return this.deleteByPublicId(publicId);
    }

    /** Batch delete via Cloudinary's admin API — one call instead of N
     * (spec OPT-9). Falls back to per-URL results for caller parity. */
    async deleteManyByUrls(urls: string[]): Promise<ImageDeletionResult[]> {
        const valid = urls.filter((url) => url && url.includes("cloudinary.com"));
        if (valid.length === 0) return [];

        const publicIds = valid
            .map((url) => extractCloudinaryPublicId(url))
            .filter((id): id is string => Boolean(id));
        if (publicIds.length === 0) {
            return valid.map((url) => ({
                publicId: "",
                success: false,
                error: `Unparseable Cloudinary URL: ${url}`,
            }));
        }

        if (publicIds.length === 1) {
            return [await this.deleteByPublicId(publicIds[0])];
        }

        try {
            const response = await cloudinary.api.delete_resources(publicIds, {
                resource_type: "image",
                invalidate: true,
            });
            const deleted = new Set<string>(response.deleted ?? []);
            return publicIds.map((publicId) =>
                deleted.has(publicId)
                    ? { publicId, success: true }
                    : {
                          publicId,
                          success: false,
                          error: `Deletion failed: ${(response as any)?.deleted_counts?.[publicId]?.reason ?? "not deleted"}`,
                      },
            );
        } catch (error) {
            const message = error instanceof Error ? error.message : "Batch deletion failed";
            return publicIds.map((publicId) => ({
                publicId,
                success: false,
                error: message,
            }));
        }
    }
}

export const cloudinaryService = new CloudinaryService();
