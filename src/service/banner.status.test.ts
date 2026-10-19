import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const find = vi.fn();
const findOne = vi.fn();

vi.mock("../config/db.config", () => ({
    default: { getRepository: () => ({ find, findOne }) },
}));
vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }));
vi.mock("./category.service", () => ({ CategoryService: class {} }));
vi.mock("./subcategory.service", () => ({ SubcategoryService: class {} }));
vi.mock("./deal.service", () => ({ DealService: class {} }));
vi.mock("./image.service", () => ({ CloudinaryService: class {} }));
vi.mock("./product.service", () => ({ ProductService: class {} }));

import { BannerService } from "./banner.service";
import { BannerStatus } from "../entities/banner.entity";

const NOW = new Date("2026-09-29T09:00:00.000Z");

function banner(id: number, stored: BannerStatus, start: string, end: string) {
    return { id, status: stored, startDate: new Date(start), endDate: new Date(end) };
}

describe("banner status on read", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(NOW);
        find.mockReset();
        findOne.mockReset();
    });
    afterEach(() => vi.useRealTimers());

    /**
     * The stored column is only refreshed by a cron, so a read served it stale:
     * the admin list called a banner Active after it had ended.
     */
    it("reports the status the dates imply, not the stored one", async () => {
        find.mockResolvedValue([
            banner(1, BannerStatus.ACTIVE, "2026-09-13T00:00:00Z", "2026-09-29T00:00:00Z"),
            banner(2, BannerStatus.SCHEDULED, "2026-09-29T08:00:00Z", "2026-10-30T00:00:00Z"),
            banner(3, BannerStatus.ACTIVE, "2026-10-01T00:00:00Z", "2026-10-30T00:00:00Z"),
        ]);

        const result = await new BannerService().getAllBanners();

        expect(result.map((b) => b.status)).toEqual([
            BannerStatus.EXPIRED,
            BannerStatus.ACTIVE,
            BannerStatus.SCHEDULED,
        ]);
    });

    it("does the same for a single banner", async () => {
        findOne.mockResolvedValue(
            banner(4, BannerStatus.SCHEDULED, "2026-09-29T08:00:00Z", "2026-10-30T00:00:00Z"),
        );

        expect((await new BannerService().getBannerById(4)).status).toBe(BannerStatus.ACTIVE);
    });
});
