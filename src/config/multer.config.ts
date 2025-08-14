import multer, { memoryStorage } from 'multer';

export const multerOptions = {
    storage: memoryStorage(),
    fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024, 
    },
};

// Accept any files
export const uploadMiddleware = multer(multerOptions).any();

export interface MulterFile {
    fieldname: string;
    originalname: string;
    mimetype: string;
    buffer: Buffer;
}
