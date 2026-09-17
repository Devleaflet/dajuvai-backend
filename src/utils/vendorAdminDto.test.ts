import { describe, expect, it } from "vitest";

import type { Vendor } from "../entities/vendor.entity";
import { toVendorAdminDTO } from "./vendorAdminDto";
import { sanitizeVendorForAdmin } from "./sanitize.util";

/**
 * Both vendor projections are allowlists, so a column added to the entity is
 * invisible to the admin console until it is named in them. That is the right
 * default — it is also how vendor deletion went unnoticed.
 *
 * Requesting deletion sets `isApproved` to false, which moves the vendor out
 * of the approved list and into the one an admin reads as "awaiting
 * approval". Without the deletion timestamps the two are indistinguishable,
 * and approving a departing vendor does not stop the hourly job that finalises
 * the deletion.
 */
function vendor(overrides: Partial<Vendor> = {}): Vendor {
    return {
        id: 95,
        businessName: "Leaf bakerys",
        email: "leaf@example.com",
        password: "$2b$10$notarealhash",
        phoneNumber: "9812345678",
        telePhone: "01343431",
        district: { id: 1, name: "Kathmandu" },
        districtId: 1,
        businessRegNumber: "REG-1",
        taxNumber: "TAX-1",
        taxDocuments: [],
        citizenshipDocuments: [],
        isVerified: true,
        isApproved: false,
        createdAt: new Date("2026-01-01"),
        paymentOptions: [],
        deletionRequestedAt: new Date("2026-09-01"),
        deletionScheduledFor: new Date("2026-10-01"),
        verificationCode: "123456",
        resetToken: "a-reset-token",
        ...overrides,
    } as unknown as Vendor;
}

describe("vendor admin projections", () => {
    it("tells a departing vendor apart from one awaiting approval", () => {
        const pending = toVendorAdminDTO(vendor());

        expect(pending.isApproved).toBe(false);
        expect(pending.deletionScheduledFor).toEqual(new Date("2026-10-01"));
        expect(pending.deletionRequestedAt).toEqual(new Date("2026-09-01"));
    });

    it("reports no deletion for an ordinary applicant", () => {
        const applicant = toVendorAdminDTO(
            vendor({ deletionRequestedAt: null, deletionScheduledFor: null }),
        );

        expect(applicant.deletionScheduledFor).toBeNull();
        expect(applicant.deletionRequestedAt).toBeNull();
    });

    it("carries the same two fields on the approved-list projection", () => {
        const row = sanitizeVendorForAdmin(vendor({ isApproved: true }));

        expect(row.deletionScheduledFor).toEqual(new Date("2026-10-01"));
    });

    /** Neither projection may leak a credential, whatever else is added. */
    it("never exposes a secret", () => {
        for (const row of [
            toVendorAdminDTO(vendor()) as Record<string, unknown>,
            sanitizeVendorForAdmin(vendor()) as unknown as Record<string, unknown>,
        ]) {
            for (const key of ["password", "verificationCode", "resetToken"]) {
                expect(row).not.toHaveProperty(key);
            }
        }
    });
});
