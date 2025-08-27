import { MoreThan } from 'typeorm';
import AppDataSource from '../config/db.config';
import { User, UserRole } from '../entities/user.entity';
import { Vendor } from '../entities/vendor.entity';
import { APIError } from '../utils/ApiError.utils';
import { errorUtil } from 'zod/lib/helpers/errorUtil';
import { waitForDebugger } from 'inspector';

/**
 * User repository instance for database operations.
 */
const userDB = AppDataSource.getRepository(User);

/**
 * Vendor repository instance for database operations.
 */
const vendorDB = AppDataSource.getRepository(Vendor);

/**
 * Fetches all users from the database.
 * @returns Promise<User[]> - Array of all users
 */
export const fetchAllUser = async (): Promise<User[]> => {
    return await userDB.find();
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

/**
 * Finds a user by their email.
 * @param email - User's email
 * @returns Promise<User | null> - User entity if found, else null
 */
export const findUserByEmail = async (email: string): Promise<User | null> => {
    return await userDB.findOneBy({ email });
};

export const findUserById = async (id: number) => {
    return await userDB.findOneBy({ id })
}

/**
 * Finds a user by email or username (for login).
 * @param email - Email or username string
 * @returns Promise<User | null> - User entity if found, else null
 */
export const findUserByEmailLogin = async (email: string): Promise<User | null> => {
    return await userDB.findOne({
        where: [{ email }, { username: email }],
    });
};

/**
 * Finds a user by reset token if the token is still valid (not expired).
 * @param token - Password reset token string
 * @returns Promise<User | null> - User entity if found, else null
 */
export const findUserByResetToken = async (token: string): Promise<User | null> => {
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
export const getUserByIdService = async (id: number): Promise<User | null> => {
    const user = await userDB.findOne({
        where: { id: id },
        relations: ['address']
    })

    console.log("----------------User------------------------")
    console.log(user)
    return user;
    // return await userDB.findOneBy({ id });
};

export const getAllStaff = async () => {
    return await userDB.find({
        where: {
            role: UserRole.STAFF
        }
    })
}


export const deleteStaffById = async (id: number) => {
    return await userDB.delete(id)
}


export const updateStaffById = async (id: number, data: any) => {
    await userDB.update({
        id,
        role: UserRole.STAFF
    },
        data
    )

    const updateStaff = await userDB.findOne({
        where: { id }
    })

    return updateStaff
}

/**
 * Updates user data for a given user ID.
 * @param id - User ID
 * @param data - Partial user data to update
 * @returns Promise<User | null> - Updated user entity if found, else null
 */
export const updateUserService = async (id: number, data: Partial<User>): Promise<User | null> => {
    const user = await userDB.findOneBy({ id });
    if (!user) return null;

    await userDB.update(id, data);
    return await userDB.findOneBy({ id });
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
export const findVendorByEmail = async (email: string): Promise<Vendor | null> => {
    return await vendorDB.findOne({ where: { email } });
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
export const findVendorByResetToken = async (token: string): Promise<Vendor | null> => {
    return await vendorDB.findOne({
        where: {
            resetToken: token,
            resetTokenExpire: MoreThan(new Date()),
        },
    });
};


export const deleteUserDataByFacebookId = async (user_id: string) => {
    const userId = await userDB.findOne({
        where: {
            facebookId: user_id
        }
    })

    if (!userId) {
        throw new APIError(404, "User not found")
    }

    const userid = Number(userId);

    const deleteUser = await userDB.delete(userid);

    console.log(deleteUser)

    return deleteUser;
}