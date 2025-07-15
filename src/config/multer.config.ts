import { memoryStorage } from 'multer';

export const multerOptions = {
    // Use memory storage to keep uploaded files in memory as Buffer objects
    storage: memoryStorage(),

    // Filter function to allow only specific image MIME types
    fileFilter: (req: any, file: Express.Multer.File, cb: any) => {
        // Allowed image MIME types
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];

        // Reject file if MIME type is not in allowedTypes
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Only JPEG and PNG images are allowed'), false);
        }

        // Accept file if MIME type is valid
        cb(null, true);
    },

    // Limits on the uploaded files
    limits: {
        fileSize: 5 * 1024 * 1024, // Max file size 5MB per file
        files: 5, // Max number of files allowed per upload is 5
    },
};
