import { v2 as cloudinary } from "cloudinary";
import config from "./env.config";

/**
 * The single place Cloudinary is configured (spec OPT-2 / BUG-4).
 * The SDK is a singleton; importing this module anywhere yields the same
 * configured instance — no service may call cloudinary.config() again.
 */
cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
});

export default cloudinary;
