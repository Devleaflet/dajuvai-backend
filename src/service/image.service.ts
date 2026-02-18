import { v2 as cloudinary } from 'cloudinary';
export class ImageService {

    async uploadSingleImage(file: Express.Multer.File, folderName: string) {
        if (!file) throw new Error("No file provided");

        const isPdf = file.mimetype === "application/pdf";

        const result = await new Promise<string>((resolve, reject) => {
            cloudinary.uploader.upload_stream(
                {
                    folder: folderName,
                    resource_type: isPdf ? "raw" : "auto"
                },
                (error, result) => {
                    if (error || !result) return reject(error || new Error("Upload failed"));
                    resolve(result.secure_url);
                }
            ).end(file.buffer);
        });

        return result;
    }



    async uploadMultipleImage(folderName: string, files: Express.Multer.File[]): Promise<{ url: string; public_id: string }[]> {
        try {
            if (!files || files.length === 0) throw new Error("No files provided");

            const uploadPromises = files.map((file) =>
                cloudinary.uploader.upload(file.path, {
                    folder: folderName,
                    resource_type: "auto",
                })
            );

            const results = await Promise.all(uploadPromises);

            return results.map((result) => ({
                url: result.secure_url,
                public_id: result.public_id,
            }));
        } catch (error) {
            throw new Error("Cloudinary multiple upload failed: " + error.message);
        }
    }

    async deleteImageByUrl(url: string): Promise<void> {
        try {
            const matches = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z]+$/);
            if (!matches || !matches[1]) {
                console.warn(`[ImageService] Could not parse public_id from URL: ${url}`);
                return;
            }
            const publicId = matches[1];
            const result = await cloudinary.uploader.destroy(publicId);
            console.log(`[ImageService] Deleted image ${publicId}:`, result);
        } catch (error) {
            console.error(`[ImageService] Failed to delete image at ${url}:`, error);
        }
    }

    async deleteImagesByUrls(urls: string[]): Promise<void> {
        await Promise.all(urls.map((url) => this.deleteImageByUrl(url)));
    }
}