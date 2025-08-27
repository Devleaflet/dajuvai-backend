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
}