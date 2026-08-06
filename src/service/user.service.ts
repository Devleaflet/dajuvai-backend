import { DataSource, MoreThan } from "typeorm";
import bcrypt from "bcryptjs";
import AppDataSource from "../config/db.config";
import { User, UserRole } from "../entities/user.entity";
import { Vendor } from "../entities/vendor.entity";
import { APIError } from "../utils/ApiError.utils";
import { waitForDebugger } from "inspector";
import { IUpdateUserRequest } from "../interface/user.interface";
import { Address } from "../entities/address.entity";
import { add } from "winston";
import { SanitizedUser, sanitizeUser } from "../utils/sanitize.util";
import { StaffSignUpInput } from "../utils/zod_validations/user.zod";
import { StaffPermission } from "../entities/staffPermission.entity";
import { PermissionAction, PermissionLevel } from "../entities/permission.enum";
import { getPermissionString } from "../utils/permission.utils";

/**
 * User repository instance for database operations.
 */
const userDB = AppDataSource.getRepository(User);

const staffPerDB = AppDataSource.getRepository(StaffPermission);

/**
 * Vendor repository instance for database operations.
 */
const vendorDB = AppDataSource.getRepository(Vendor);

/**
 * Fetches all users from the database.
 * @returns Promise<User[]> - Array of all users
 */
export const fetchAllUser = async (): Promise<User[]> => {
    return await userDB.find({
        select: [
            "id",
            "fullName",
            "username",
            "email",
            "phoneNumber",
            "role",
            "isVerified",
            "createdAt",
            "updatedAt",
            "profilePicture",
            "provider",
        ],
    });
};

/**
 * Creates a new user record.
 * @param userData - Partial user data for creation
 * @returns Promise<User> - Newly created user entity
 */
export const createUser = async (userData: Partial<User>): Promise<User> => {
    const user = userDB.create(userData);
    return await userDB.save(user);
};

export const setStaffPermissions = async(userId:number, data: StaffSignUpInput["permissions"]) => {
    const permissionArray = [];
    
    for(const [module, permission] of Object.entries(data)){
        const action = getPermissionString(permission)

        permissionArray.push({
            staffId: userId,
            module,
            permissionLevel: permission,
            permissionAction: action
        })
    }

    if(permissionArray.length > 0){
        await staffPerDB.insert(permissionArray)
    }
}

export const getStaffPermissionsById = async (staffId: number) => {
    return await staffPerDB.find({
        where: { staffId },
    });
};

export const getFormattedStaffPermissions = async (staffId: number): Promise<Record<string, string>> => {
    const staffPerms = await getStaffPermissionsById(staffId);
    const permissions: Record<string, string> = {};
    staffPerms.forEach((p) => {
        const actionStr = p.permissionAction || getPermissionString(p.permissionLevel);
        permissions[p.module] = actionStr;
    });
    return permissions;
};

export const updateStaffPermissions = async (staffId: number, data: StaffSignUpInput["permissions"]) => {
    // Remove all existing permissions for this staff member
    await staffPerDB.delete({ staffId });
    // Re-insert the new set (if any)
    if (data && Object.keys(data).length > 0) {
        await setStaffPermissions(staffId, data);
    }
};


/**
 * Finds a user by their email.
 * @param email - User's email
 * @returns Promise<User | null> - User entity if found, else null
 */
export const findUserByEmail = async (email: string): Promise<User | null> => {
    return await userDB.findOneBy({ email });
};

export const findUserById = async (id: number): Promise<User> => {
    return await userDB.findOneBy({ id });
};

/**
 * Finds a user by email or username (for login).
 * @param email - Email or username string
 * @returns Promise<User | null> - User entity if found, else null
 */
export const findUserByEmailLogin = async (
    email: string,
): Promise<User | null> => {
    return await userDB.findOne({
        where: [{ email }, { username: email }],
        select: {
            id: true,
            email: true,
            role: true,
            provider: true,
            isVerified: true,
            password: true,
        },
    });
};

/**
 * Finds a user by reset token if the token is still valid (not expired).
 * @param token - Password reset token string
 * @returns Promise<User | null> - User entity if found, else null
 */
export const findUserByResetToken = async (
    token: string,
): Promise<User | null> => {
    return await userDB.findOne({
        where: {
            resetToken: token,
            resetTokenExpire: MoreThan(new Date()),
        },
    });
};

/**
 * Fetches a user by their ID.
 * @param id - User ID
 * @returns Promise<User | null> - User entity if found, else null
 */
export const getUserByIdService = async (
    id: number,
): Promise<(SanitizedUser & { permissions?: Record<string, string> }) | null> => {
    const user = await userDB.findOne({
        where: { id: id },
        relations: ["address"],
    });

    if (!user) return null;
    const sanitized = sanitizeUser(user);

    if (user.role === UserRole.STAFF) {
        const permissions = await getFormattedStaffPermissions(user.id);
        return { ...sanitized, permissions };
    }

    return sanitized;
};

export const getAllStaff = async () => {
    const users = await userDB.find({
        where: {
            role: UserRole.STAFF,
        },
        select: [
            "id",
            "fullName",
            "email",
            "phoneNumber",
            "role",
            "isVerified",
            "createdAt",
            "updatedAt",
        ],
    });

    // Attach permissions for each staff member
    const staffWithPermissions = await Promise.all(
        users.map(async (user) => {
            const permissions = await staffPerDB.find({ where: { staffId: user.id } });
            const permissionsMap: Record<string, number> = {};
            permissions.forEach((p) => {
                permissionsMap[p.module] = p.permissionLevel;
            });
            return { ...user, permissions: permissionsMap };
        })
    );

    return staffWithPermissions;
};


export const deleteStaffById = async (id: number) => {
    return await userDB.delete(id);
};

export const updateStaffById = async (id: number, data: any) => {
    const { confirmPassword, password, ...rest } = data;
    const updateData: Record<string, unknown> = { ...rest };

    if (password) {
        updateData.password = await bcrypt.hash(password, 10);
    }

    await userDB.update(
        {
            id,
            role: UserRole.STAFF,
        },
        updateData,
    );

    const updateStaff = await userDB.findOne({
        where: { id },
        select: [
            "id",
            "fullName",
            "email",
            "phoneNumber",
            "role",
            "isVerified",
            "createdAt",
            "updatedAt",
            "profilePicture",
        ],
    });

    return updateStaff;
};

/**
 * Updates user data for a given user ID.
 * @param id - User ID
 * @param data - Partial user data to update
 * @returns Promise<User | null> - Updated user entity if found, else null
 */
export const updateUserService = async (
    id: number,
    data: IUpdateUserRequest,
    user: User,
): Promise<User | null> => {
    const addressDb = AppDataSource.getRepository(Address);

    // update address
    if (data.address) {
        const existingAddress = await addressDb.findOne({
            where: { user: { id: user.id } },
        });
        if (existingAddress) {
            await addressDb.update(existingAddress.id, data.address);
        } else {
            const newAddress = addressDb.create({
                ...data.address,
                user: { id: user.id },
            });

            await addressDb.save(newAddress);
        }
    }

    const { address, ...userData } = data;
    await userDB.update(id, userData);

    return await userDB.findOne({
        where: { id },
        relations: ["address"],
    });
};

/**
 * Saves the user entity (insert or update).
 * @param user - User entity instance
 * @returns Promise<User> - Saved user entity
 */
export const saveUser = async (user: User): Promise<User> => {
    return await userDB.save(user);
};

/**
 * Finds a vendor by email.
 * @param email - Vendor's email
 * @returns Promise<Vendor | null> - Vendor entity if found, else null
 */
export const findVendorByEmail = async (
    email: string,
): Promise<Vendor | null> => {
    return await vendorDB.findOne({ where: { email } });
};

export const findvendorByvendorId = async (
    vendorId: number,
): Promise<Vendor | null> => {
    return await vendorDB.findOne({
        where: { id: vendorId },
    });
};
/**
 * Saves a vendor entity.
 * @param vendor - Vendor entity instance
 * @returns Promise<Vendor> - Saved vendor entity
 */
export const saveVendor = async (vendor: Vendor): Promise<Vendor> => {
    return await vendorDB.save(vendor);
};

/**
 * Finds a vendor by reset token if the token is still valid (not expired).
 * @param token - Password reset token string
 * @returns Promise<Vendor | null> - Vendor entity if found, else null
 */
export const findVendorByResetToken = async (
    token: string,
): Promise<Vendor | null> => {
    return await vendorDB.findOne({
        where: {
            resetToken: token,
            resetTokenExpire: MoreThan(new Date()),
        },
    });
};

export const deleteUserDataByFacebookId = async (user_id: string) => {
    const user = await userDB.findOne({
        where: {
            facebookId: user_id,
        },
    });

    if (!user) {
        throw new APIError(404, "User not found");
    }

    const deleteUser = await userDB.remove(user);

    console.log(deleteUser);

    return deleteUser;
};
