import multer, { memoryStorage } from 'multer';


const MAX_VARIANTS = 50;


const variantFields = Array.from({ length: MAX_VARIANTS }, (_, i) => ({
    name: `variantImages${i + 1}`,
    maxCount: 5,
}));


export const multerOptions = {

    storage: memoryStorage(),

    fileFilter: (req: any, file: Express.Multer.File, cb: any) => {

        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];


        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Only JPEG, PNG, and WebP images are allowed'), false);
        }

        cb(null, true);
    },

    // limits: {
    //     fileSize: 5 * 1024 * 1024,
    // },
};


export const uploadMiddleware = multer(multerOptions).fields([
    { name: 'productImages', maxCount: 5 },
    ...variantFields,
]);