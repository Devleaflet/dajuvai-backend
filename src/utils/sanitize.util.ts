import { User } from "../entities/user.entity";
import { Vendor } from "../entities/vendor.entity";

export const sanitizeVendor = (vendor: Vendor) => {
    return {
        id: vendor.id,
        businessName: vendor.businessName,
        email: vendor.email,
        phoneNumber: vendor.phoneNumber,

        districtId: vendor.districtId,
        district: {
            id: vendor.districtId,
            name: vendor.district.name,
        },
    };
};

export const sanitizeUser = (user: User) => {
    return {
        id: user.id,
        name: user.fullName,
        phone: user.phoneNumber,
        email: user.email,
    };
};
