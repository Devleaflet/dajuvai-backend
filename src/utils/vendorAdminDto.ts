import { Vendor } from "../entities/vendor.entity";

export function toVendorAdminDTO(vendor: Vendor) {
    return {
        id: vendor.id,
        businessName: vendor.businessName,
        email: vendor.email,
        phoneNumber: vendor.phoneNumber,
        telePhone: vendor.telePhone,
        district: vendor.district,
        businessRegNumber: vendor.businessRegNumber,
        taxNumber: vendor.taxNumber,
        taxDocuments: vendor.taxDocuments,
        citizenshipDocuments: vendor.citizenshipDocuments,
        isVerified: vendor.isVerified,
        isApproved: vendor.isApproved,
        createdAt: vendor.createdAt,
        // Requesting deletion clears `isApproved`, which lands the vendor in
        // this very list. Without these two an admin sees only "awaiting
        // approval" and cannot tell a new applicant from a store on its way
        // out — and approving the latter does not call off the deletion job.
        deletionRequestedAt: vendor.deletionRequestedAt ?? null,
        deletionScheduledFor: vendor.deletionScheduledFor ?? null,
        paymentOptions: vendor.paymentOptions.map(po => ({
            id: po.id,
            paymentType: po.paymentType,
            details: po.details,
            qrCodeImage: po.qrCodeImage,
            isActive: po.isActive
        }))
    };
}
