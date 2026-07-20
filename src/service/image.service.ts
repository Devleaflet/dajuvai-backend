import { v2 as cloudinary } from "cloudinary";

export interface UploadedFile {
    url: string;
    publicId: string;
    resourceType: string;
}

export class ImageService {
    async uploadSingleImage(
        file: Express.Multer.File,
        folderName: string,
    ): Promise<UploadedFile> {
        if (!file) throw new Error("No file provided");

        const isImage = file.mimetype.startsWith("image/");
        const isPdf = file.mimetype === "application/pdf";

        const uploadOptions: Record<string, unknown> = {
            folder: folderName,
            resource_type: isImage || isPdf ? "auto" : "raw",
        };

        if (!isImage && !isPdf) {
            const originalExt = file.originalname.split(".").pop() || "bin";
            const baseName = file.originalname
                .replace(/\.[^/.]+$/, "")
                .replace(/[^a-zA-Z0-9_-]/g, "_")
                .slice(0, 80);
            uploadOptions.public_id = `${baseName}_${Date.now()}.${originalExt}`;
        }

        const result = await new Promise<any>((resolve, reject) => {
            cloudinary.uploader
                .upload_stream(uploadOptions, (error, result) => {
                    if (error || !result)
                        return reject(error || new Error("Upload failed"));
                    resolve(result);
                })
                .end(file.buffer);
        });

        console.log(result);

        return {
            url: result.secure_url,
            publicId: result.public_id,
            resourceType: result.resource_type,
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
