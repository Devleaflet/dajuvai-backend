import multer, { memoryStorage } from 'multer';

export const multerOptions = {
    storage: memoryStorage(),
    fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
        const allowedTypes = [
            'image/jpeg',
            'image/png',
            'image/jpg',
            'image/webp',
            'image/avif',
            'application/pdf',
            'image/heic',
            'image/heif',
            'image/x-canon-cr2',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/csv',
        ];

        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Only JPEG, PNG, WebP images, PDF, Word, Excel and CSV files are allowed'), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
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
