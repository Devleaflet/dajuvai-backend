import { BadRequestError } from "../errors";

export const MAX_UPLOAD_SIZE = 5 * 1024 * 1024;

export type UploadResourceType = "image" | "raw";

export interface ValidatedUpload {
    mimeType: string;
    resourceType: UploadResourceType;
    extension: string;
}

const IMAGE_MIME_TYPES: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/pjpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/heic": "heic",
    "image/heif": "heif",
};

const OFFICE_MIME_TYPES = new Set([
    "application/msword",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

const OFFICE_EXTENSIONS = new Set(["doc", "docx", "xls", "xlsx"]);

const startsWith = (buffer: Buffer, bytes: number[]): boolean =>
    bytes.every((byte, index) => buffer[index] === byte);

const hasTextOnlyContent = (buffer: Buffer): boolean => {
    for (const byte of buffer) {
        if (byte === 0) return false;
    }
    return true;
};

const getExtension = (filename: string): string => {
    const extension = filename.split(".").pop()?.toLowerCase() ?? "";
    return extension.replace(/[^a-z0-9]/g, "");
};

const getDeclaredMimeType = (mimeType: string | undefined): string =>
    (mimeType ?? "").split(";", 1)[0].trim().toLowerCase();

const detectImage = (buffer: Buffer): string | undefined => {
    if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
    if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        return "image/png";
    if (buffer.subarray(0, 6).toString("ascii").match(/^GIF8[79]a$/))
        return "image/gif";
    if (
        buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
        buffer.subarray(8, 12).toString("ascii") === "WEBP"
    )
        return "image/webp";
    if (
        buffer.subarray(4, 12).toString("ascii") === "ftypavif" ||
        buffer.subarray(4, 12).toString("ascii") === "ftypavis"
    )
        return "image/avif";
    if (
        ["ftypheic", "ftypheix", "ftyphevc", "ftyphevx", "ftypmif1", "ftypmsf1"].includes(
            buffer.subarray(4, 12).toString("ascii"),
        )
    )
        return "image/heic";
    return undefined;
};

const isCanonRaw = (buffer: Buffer): boolean =>
    startsWith(buffer, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(buffer, [0x4d, 0x4d, 0x00, 0x2a]);

export const validateUploadFolder = (folder: unknown): string => {
    if (typeof folder !== "string" || folder.trim().length === 0) {
        throw new BadRequestError("Upload folder is required");
    }

    const normalized = folder.trim();
    if (!/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(normalized)) {
        throw new BadRequestError("Invalid upload folder");
    }
    return normalized;
};

export const validateUploadFile = (
    file: Express.Multer.File | undefined,
): ValidatedUpload => {
    if (!file || !Buffer.isBuffer(file.buffer)) {
        throw new BadRequestError("Uploaded file is missing or unreadable");
    }

    const size = Math.max(file.size ?? 0, file.buffer.length);
    if (size > MAX_UPLOAD_SIZE) {
        throw new BadRequestError("Uploaded file must be 5 MB or smaller");
    }

    const declaredMimeType = getDeclaredMimeType(file.mimetype);
    const extension = getExtension(file.originalname ?? "");

    if (file.buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
        return { mimeType: "application/pdf", resourceType: "raw", extension: "pdf" };
    }

    const detectedImageMimeType = detectImage(file.buffer);
    if (detectedImageMimeType) {
        return {
            mimeType: detectedImageMimeType,
            resourceType: "image",
            extension: IMAGE_MIME_TYPES[detectedImageMimeType],
        };
    }

    if (declaredMimeType === "image/x-canon-cr2" && isCanonRaw(file.buffer)) {
        return { mimeType: "image/x-canon-cr2", resourceType: "raw", extension: "cr2" };
    }

    const isOfficeDocument =
        (file.buffer.subarray(0, 4).toString("hex") === "d0cf11e0" &&
            OFFICE_EXTENSIONS.has(extension)) ||
        (startsWith(file.buffer, [0x50, 0x4b, 0x03, 0x04]) &&
            OFFICE_EXTENSIONS.has(extension));
    if (isOfficeDocument && (OFFICE_MIME_TYPES.has(declaredMimeType) || OFFICE_EXTENSIONS.has(extension))) {
        return { mimeType: declaredMimeType || "application/octet-stream", resourceType: "raw", extension };
    }

    if ((declaredMimeType === "text/csv" || extension === "csv") && hasTextOnlyContent(file.buffer)) {
        return { mimeType: "text/csv", resourceType: "raw", extension: "csv" };
    }

    throw new BadRequestError("Uploaded file does not match a supported file format");
};
