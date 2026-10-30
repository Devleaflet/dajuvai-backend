import { beforeEach, describe, expect, it, vi } from "vitest";

// QA BUG-033: of every admin and vendor change QA made, only "Product created"
// reached the audit log. Each mutation below has to leave an entry naming the
// account that made it.

const { repo, record, transaction, dataSource } = vi.hoisted(() => {
    const repo: Record<string, ReturnType<typeof vi.fn>> & { manager?: unknown } = {
        findOne: vi.fn(),
        findOneOrFail: vi.fn(),
        find: vi.fn(),
        save: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
        softDelete: vi.fn(),
        recover: vi.fn(),
        createQueryBuilder: vi.fn(),
    };
    const transaction = vi.fn();
    repo.manager = { transaction };
    return {
        repo,
        record: vi.fn(),
        transaction,
        dataSource: { getRepository: () => repo, transaction, manager: { transaction } },
    };
});

vi.mock("../config/db.config", () => ({ default: dataSource }));
vi.mock("./audit.service", async (importOriginal) => ({
    ...(await importOriginal<typeof import("./audit.service")>()),
    auditService: { record },
}));
vi.mock("node-cron", () => ({ default: { schedule: vi.fn() } }));
vi.mock("./image.service", () => ({ CloudinaryService: class {} }));
vi.mock("./product-search-indexer.service", () => ({
    ProductSearchIndexer: class {
        rebuildProduct = vi.fn();
    },
}));

import { AuditActorType } from "../entities/auditLog.entity";
import { UserRole } from "../entities/user.entity";
import { BannerType } from "../entities/banner.entity";
import { userAuditActor } from "./audit.service";
import { CategoryService } from "./category.service";
import { PromoService } from "./promo.service";
import { BannerService } from "./banner.service";
import { DealService } from "./deal.service";
import { VendorService } from "./vendor.service";
import { ProductService } from "./product.service";

const admin = { type: AuditActorType.ADMIN, id: 1 };
const staff = { type: AuditActorType.STAFF, id: 2 };

function recorded() {
    expect(record).toHaveBeenCalledTimes(1);
    return record.mock.calls[0][0];
}

beforeEach(() => {
    // reset, not clear: an unconsumed mockResolvedValueOnce would leak into the next test.
    vi.resetAllMocks();
    repo.save.mockImplementation(async (entity: unknown) => entity);
    repo.create.mockImplementation((entity: unknown) => entity);
    transaction.mockImplementation(async (work: (manager: unknown) => unknown) =>
        work({ getRepository: () => repo }),
    );
});

describe("userAuditActor", () => {
    it("names staff as STAFF and admins as ADMIN, by user id", () => {
        expect(userAuditActor({ id: 2, role: UserRole.STAFF })).toEqual(staff);
        expect(userAuditActor({ id: 1, role: UserRole.ADMIN })).toEqual(admin);
    });
});

describe("audited admin and vendor mutations", () => {
    it("category edit", async () => {
        repo.findOne
            .mockResolvedValueOnce({ id: 1, role: UserRole.ADMIN })
            .mockResolvedValueOnce({ id: 7, name: "Old", image: null })
            .mockResolvedValueOnce({ id: 7, name: "Shoes" });

        await new CategoryService().updateCategory(7, { name: "Shoes" } as never, 1);

        expect(recorded()).toMatchObject({
            module: "CATEGORY",
            action: "UPDATED",
            entityType: "Category",
            entityId: 7,
            actor: admin,
        });
    });

    it("promo create, by the staff member who made it", async () => {
        await new PromoService().createPromo({ promoCode: "save10" } as never, staff);

        expect(recorded()).toMatchObject({
            module: "PROMO",
            action: "CREATED",
            entityType: "Promo",
            actor: staff,
            summary: "Promo code created: SAVE10",
        });
    });

    it("promo delete", async () => {
        repo.findOne.mockResolvedValueOnce({ id: 3, promoCode: "SAVE10" });

        await new PromoService().deletePromo({ id: 3 } as never, admin);

        expect(recorded()).toMatchObject({ module: "PROMO", action: "DELETED", entityId: 3, actor: admin });
    });

    it("banner edit", async () => {
        repo.findOne.mockResolvedValueOnce({
            id: 4,
            name: "Old",
            type: BannerType.HERO,
            startDate: new Date("2026-01-01"),
            endDate: new Date("2027-01-01"),
            createdById: 1,
        });

        await new BannerService().updateBanner(4, { name: "Dashain" } as never, staff);

        expect(recorded()).toMatchObject({
            module: "BANNER",
            action: "UPDATED",
            entityType: "Banner",
            entityId: 4,
            actor: staff,
        });
    });

    it("deal edit", async () => {
        repo.findOne.mockResolvedValueOnce({ id: 5, name: "Old" });
        repo.findOneOrFail.mockResolvedValueOnce({ id: 5, name: "Tihar" });

        await new DealService().updateDeal(5, { name: "Tihar" } as never, admin);

        expect(recorded()).toMatchObject({ module: "DEAL", action: "UPDATED", entityType: "Deal", entityId: 5, actor: admin });
    });

    it("vendor approval", async () => {
        repo.findOne.mockResolvedValueOnce({ id: 9, businessName: "QA Store" });
        repo.update.mockResolvedValueOnce({ affected: 1 });

        await new VendorService().approveVendor(9, staff);

        expect(recorded()).toMatchObject({
            module: "ACCOUNT",
            action: "APPROVED",
            entityType: "Vendor",
            entityId: 9,
            actor: staff,
            summary: "Vendor approved: QA Store",
        });
    });

    it("vendor rejection keeps the name the deletion is about to erase", async () => {
        repo.findOne.mockResolvedValueOnce({ id: 9, businessName: "QA Store" });
        const service = new VendorService();
        vi.spyOn(service, "finalizeVendorDeletion").mockResolvedValue();

        await service.deleteVendor(9, admin, "Incomplete documents");

        expect(recorded()).toMatchObject({
            module: "ACCOUNT",
            action: "REJECTED",
            entityId: 9,
            actor: admin,
            summary: "Vendor rejected: QA Store",
            after: { rejectionReason: "Incomplete documents" },
        });
    });

    it("product edit by an admin names the admin, not the owning vendor", async () => {
        const service = new ProductService(dataSource as never);
        Object.assign(service as never, {
            categoryService: { getCategoryById: async () => ({ id: 1 }) },
            subcategoryService: { getSubcategoryById: async () => ({ id: 2 }) },
        });
        repo.findOne.mockResolvedValueOnce({
            id: 11,
            name: "Old",
            hasVariants: false,
            basePrice: 100,
            stock: 5,
            discountAmount: 0,
            discountPercent: 0,
            productImages: ["https://example.com/a.jpg"],
            variants: [],
            deal: null,
        });

        await service.updateProduct(5, true, 11, { name: "New" }, 1, 2, admin);

        expect(recorded()).toMatchObject({
            module: "PRODUCT",
            action: "UPDATED",
            entityType: "Product",
            entityId: 11,
            actor: admin,
            summary: "Product updated: New",
        });
    });

    it("product archive by its vendor, inside the archive transaction", async () => {
        repo.findOne.mockResolvedValueOnce({ id: 11, name: "Kettle", vendor: { id: 5 }, variants: [] });

        await new ProductService(dataSource as never).deleteProductById(11, { vendorId: 5 });

        expect(recorded()).toMatchObject({
            module: "PRODUCT",
            action: "ARCHIVED",
            entityId: 11,
            actor: { type: AuditActorType.VENDOR, id: 5 },
            summary: "Product archived: Kettle",
        });
        expect(record.mock.calls[0][1]).toBeDefined();
    });

    it("product restore by an admin", async () => {
        const builder = { withDeleted: () => builder, where: () => builder, andWhere: () => builder, getMany: async () => [] };
        repo.createQueryBuilder.mockReturnValue(builder);
        repo.findOne
            .mockResolvedValueOnce({ id: 11, name: "Kettle", vendor: { id: 5 }, deletedAt: new Date() })
            .mockResolvedValueOnce({ id: 1, role: UserRole.ADMIN })
            .mockResolvedValueOnce({ id: 11, name: "Kettle" });

        await new ProductService(dataSource as never).restoreProduct(11, { userId: 1 });

        expect(recorded()).toMatchObject({
            module: "PRODUCT",
            action: "RESTORED",
            entityId: 11,
            actor: admin,
            summary: "Product restored: Kettle",
        });
    });
});
