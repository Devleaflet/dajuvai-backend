import { describe, expect, it } from "vitest";
import { getUploadTransform } from "./cloudinary.util";

describe("banner Cloudinary upload transforms", () => {
    it("keeps banner artwork high resolution without cropping", () => {
        expect(getUploadTransform("banners")).toEqual({
            width: 2560,
            height: 2560,
            crop: "limit",
            quality: "auto:best",
            fetch_format: "auto",
        });
    });

    it("uses banner transform for nested banner folders", () => {
        expect(getUploadTransform("banners/hero")).toEqual({
            width: 2560,
            height: 2560,
            crop: "limit",
            quality: "auto:best",
            fetch_format: "auto",
        });
    });

    it("does not change product optimization", () => {
        expect(getUploadTransform("products")).toEqual({
            width: 2000,
            height: 2000,
            crop: "limit",
            quality: "auto:good",
            fetch_format: "auto",
        });
    });
});
