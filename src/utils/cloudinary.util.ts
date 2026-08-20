/**
 * Pure Cloudinary helpers shared by CloudinaryService and every service
 * that must resolve/derive public IDs or upload transformations.
 * No SDK imports here — fully unit-testable.
 */

export interface UploadTransformPreset {
    width: number;
    height?: number;
    crop: "limit";
    quality: "auto:good";
    fetch_format: "auto";
}

/**
 * Per-folder upload transformation presets (spec OPT-4). `crop: "limit"`
 * only downscales — never crops content and never upscales. Document
 * folders deliberately have no entry: documents must be stored untouched.
 */
const UPLOAD_TRANSFORMS: Record<string, UploadTransformPreset> = {
    products: {
        width: 2000,
        height: 2000,
        crop: "limit",
        quality: "auto:good",
        fetch_format: "auto",
    },
    banners: {
        width: 1920,
        height: 1080,
        crop: "limit",
        quality: "auto:good",
        fetch_format: "auto",
    },
    "profile-pictures": {
        width: 800,
        height: 800,
        crop: "limit",
        quality: "auto:good",
        fetch_format: "auto",
    },
    categories: {
        width: 600,
        height: 600,
        crop: "limit",
        quality: "auto:good",
        fetch_format: "auto",
    },
    subcategories: {
        width: 600,
        height: 600,
        crop: "limit",
        quality: "auto:good",
        fetch_format: "auto",
    },
};

/**
 * Resolves the upload transformation for a folder. Nested folders inherit
 * from their root ("products/variants" → products preset). Returns null
 * when the folder must store originals (documents, unknown folders).
 */
export const getUploadTransform = (
    folder: string,
): UploadTransformPreset | null => {
    const root = folder.split("/")[0]?.trim() ?? "";
    return UPLOAD_TRANSFORMS[root] ?? null;
};

/**
 * Segments that may sit between /upload/ and the version/public id:
 * URL-delivered transformations ("w_400,h_400,c_fill,f_auto,q_auto",
 * "c_fill,g_face", ...) and named transformations ("t_product_card").
 */
const TRANSFORM_SEGMENT =
    /^(t_[^/]+|([whcqfgbe]|ar|dpr)_[^,/]+(,([whcqfgbe]|ar|dpr)_[^,/]+)*)$/i;

/**
 * Extracts the Cloudinary public ID (folder path included) from a delivery
 * URL. Fixes spec BUG-2: `url.split('/').pop()` lost the folder path, so
 * deletes targeted the wrong resource and orphans accumulated forever.
 *
 * Handles version segments (v1234), transformation segments, and public
 * ids containing underscores. Returns null for non-Cloudinary or
 * non-upload URLs so callers can skip safely.
 */
export const extractCloudinaryPublicId = (url: string): string | null => {
    if (!url || !url.includes("cloudinary.com")) return null;

    const uploadIndex = url.indexOf("/upload/");
    if (uploadIndex === -1) return null;

    const tail = url.slice(uploadIndex + "/upload/".length);
    const segments = tail.split("/").filter(Boolean);
    if (segments.length === 0) return null;

    // Drop leading transformation segments, then an optional vNNN segment.
    let start = 0;
    while (start < segments.length && TRANSFORM_SEGMENT.test(segments[start])) {
        start += 1;
    }
    if (start < segments.length && /^v\d+$/.test(segments[start])) {
        start += 1;
    }

    const pathSegments = segments.slice(start);
    if (pathSegments.length === 0) return null;

    const last = pathSegments[pathSegments.length - 1];
    const dotIndex = last.lastIndexOf(".");
    // Strip the extension only when it looks like one (a-z0-9, ≤ 5 chars).
    if (dotIndex > 0 && /^[a-zA-Z0-9]{1,5}$/.test(last.slice(dotIndex + 1))) {
        pathSegments[pathSegments.length - 1] = last.slice(0, dotIndex);
    }

    const publicId = pathSegments.join("/");
    return publicId || null;
};
