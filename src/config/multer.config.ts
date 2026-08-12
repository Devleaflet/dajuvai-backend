import multer, { memoryStorage } from "multer";
import { BadRequestError } from "../errors";
import { MAX_UPLOAD_SIZE } from "../service/upload.validation";

const STRICT_UPLOAD_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/jpg",
    "image/pjpeg",
    "image/webp",
    "image/avif",
    "image/heic",
    "image/heif",
    "image/x-canon-cr2",
    "application/pdf",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/csv",
]);

export const multerOptions = {
    storage: memoryStorage(),
    fileFilter: (_req: any, file: Express.Multer.File, cb: any) => {
        if (!STRICT_UPLOAD_MIME_TYPES.has((file.mimetype ?? "").toLowerCase())) {
            return cb(new BadRequestError("Unsupported upload file type"), false);
        }
        cb(null, true);
    },
    limits: {
        fileSize: MAX_UPLOAD_SIZE,
    },
};

export const singleUploadOptions = {
    ...multerOptions,
    // Mobile clients often send application/octet-stream for valid files.
    // Content validation runs after memoryStorage has produced a buffer.
    fileFilter: (_req: any, _file: Express.Multer.File, cb: any) => cb(null, true),
    limits: {
        ...multerOptions.limits,
        files: 1,
    },
};

// Accept any files; each consuming service validates its own buffered content.
export const uploadMiddleware = multer(multerOptions).any();
export const singleUploadMiddleware = multer(singleUploadOptions).any();

export interface MulterFile {
    fieldname: string;
    originalname: string;
    mimetype: string;
    buffer: Buffer;
}
