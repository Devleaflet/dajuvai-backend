import { describe, expect, it } from "vitest";
import { baseSlug, nextFreeSlug, parseIdOrSlug, slugify, slugMatchesBase, SLUG_MAX_LENGTH } from "./slug.util";

describe("slugify", () => {
    it("lowercases and hyphenates", () => {
        expect(slugify("  Retro Round Frame Sunglasses ")).toBe("retro-round-frame-sunglasses");
    });

    it("folds accents, drops apostrophes, reads & as and", () => {
        expect(slugify("Café Crème")).toBe("cafe-creme");
        expect(slugify("Men's Fashion")).toBe("mens-fashion");
        expect(slugify("Fast & Fine+")).toBe("fast-and-fine");
    });

    it("drops scripts with no Latin form and collapses punctuation", () => {
        expect(slugify("Nepali Spicy Buff Pickle (अचार)")).toBe("nepali-spicy-buff-pickle");
        expect(slugify("Earphone Jnuobi YX-29/28")).toBe("earphone-jnuobi-yx-29-28");
        expect(slugify("अचार")).toBe("");
    });

    it("caps length on a word boundary", () => {
        const slug = slugify("word ".repeat(60));
        expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
        expect(slug.endsWith("-")).toBe(false);
        expect(slug.endsWith("word")).toBe(true);
    });
});

describe("baseSlug", () => {
    it("falls back when nothing survives", () => {
        expect(baseSlug("अचार", "product")).toBe("product");
        expect(baseSlug(null, "user")).toBe("user");
    });

    it("never yields an all-digit slug, which would read as an id", () => {
        expect(baseSlug("2024", "product")).toBe("product-2024");
    });
});

describe("nextFreeSlug", () => {
    it("takes the bare base when free, else the lowest free suffix", () => {
        expect(nextFreeSlug("shirt", [])).toBe("shirt");
        expect(nextFreeSlug("shirt", ["shirt"])).toBe("shirt-2");
        expect(nextFreeSlug("shirt", ["shirt", "shirt-2", "shirt-4"])).toBe("shirt-3");
    });
});

describe("slugMatchesBase", () => {
    it("accepts the base and its suffixed forms only", () => {
        expect(slugMatchesBase("shirt", "shirt")).toBe(true);
        expect(slugMatchesBase("shirt-3", "shirt")).toBe(true);
        expect(slugMatchesBase("shirt-blue", "shirt")).toBe(false);
        expect(slugMatchesBase(null, "shirt")).toBe(false);
    });
});

describe("parseIdOrSlug", () => {
    it("reads digits as an id", () => {
        expect(parseIdOrSlug("184")).toEqual({ id: 184 });
        expect(parseIdOrSlug("0")).toBeNull();
    });

    it("reads a well-formed slug, case-insensitively", () => {
        expect(parseIdOrSlug("Retro-Round-Frame")).toEqual({ slug: "retro-round-frame" });
    });

    it("rejects anything else", () => {
        for (const bad of ["", "a--b", "-a", "a b", "a/b", "../x", "' or 1=1"]) {
            expect(parseIdOrSlug(bad)).toBeNull();
        }
    });
});
