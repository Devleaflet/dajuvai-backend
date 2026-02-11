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
        paymentOptions: vendor.paymentOptions.map(po => ({
            id: po.id,
            paymentType: po.paymentType,
            details: po.details,
            qrCodeImage: po.qrCodeImage,
            isActive: po.isActive
        }))
    };
}
