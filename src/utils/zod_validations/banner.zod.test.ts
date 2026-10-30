import { describe, expect, it } from "vitest";

import { createBannerSchema } from "./banner.zod";

const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
const nextWeek = new Date(Date.now() + 7 * 86_400_000).toISOString();

function banner(overrides: Record<string, unknown> = {}) {
    return {
        name: "Festive hero",
        type: "HERO",
        startDate: tomorrow,
        endDate: nextWeek,
        productSource: "external",
        externalLink: "https://dajuvai.com/shop",
        desktopImage: "https://res.cloudinary.com/x/banners/desktop.jpg",
        mobileImage: "https://res.cloudinary.com/x/banners/mobile.jpg",
        ...overrides,
    };
}

function errorPaths(input: Record<string, unknown>) {
    const result = createBannerSchema.safeParse(input);
    return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("createBannerSchema images", () => {
    it.each(["HERO", "PRODUCT"])("accepts a %s banner with both images", (type) => {
        expect(errorPaths(banner({ type }))).toEqual([]);
    });

    it.each(["HERO", "PRODUCT"])("rejects a %s banner without its mobile image", (type) => {
        expect(errorPaths(banner({ type, mobileImage: undefined }))).toContain("mobileImage");
    });

    it.each(["HERO", "PRODUCT"])("rejects a %s banner without its desktop image", (type) => {
        expect(errorPaths(banner({ type, desktopImage: "" }))).toContain("desktopImage");
    });

    it("still accepts a sidebar banner with one image", () => {
        expect(errorPaths(banner({ type: "SIDEBAR", mobileImage: null }))).toEqual([]);
    });
});
