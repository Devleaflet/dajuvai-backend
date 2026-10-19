import { NextFunction, Response } from "express";
import { APIError } from "../utils/ApiError.utils";
import { AuthRequest } from "./auth.middleware";
import { ModuleName, PermissionLevel } from "../entities/permission.enum";
import { UserRole } from "../entities/user.entity";
import AppDataSource from "../data-source";
import { StaffPermission } from "../entities/staffPermission.entity";

const staffPermissionRepo = AppDataSource.getRepository(StaffPermission)

export const checkPermission = (
    module: ModuleName,
    requiredLevel: PermissionLevel,
) => {
    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        try {
            const user = req.user;

            if(!user){
                throw new APIError(401, "user not authenticated");
            }

            if(user.role === UserRole.ADMIN){
                return next();
            }

            const staffPermission = await staffPermissionRepo.findOne({
                where:{
                    staffId: user.id,
                    module: module
                }
            });

            if(
                !staffPermission ||
                staffPermission.permissionLevel < requiredLevel
            ){
                throw new APIError(
                    403,
                    `you do not have permission to perform this action on ${module}`
                )
            }

            return next();
        } catch (error) {
            next(error);
        }
    };
};

/**
 * `checkPermission` for routes behind `combinedAuthMiddleware`.
 *
 * A vendor token sets `req.vendor` and no `req.user`, so `checkPermission`
 * alone would answer 401 and lock vendors out of their own products. Vendor
 * callers are passed through to the controller, which scopes every one of
 * these routes to the vendor's own rows; staff and admins go through the
 * normal module check.
 */
export const checkPermissionUnlessVendor = (
    module: ModuleName,
    requiredLevel: PermissionLevel,
) => {
    const guard = checkPermission(module, requiredLevel);

    return async (req: AuthRequest, res: Response, next: NextFunction) => {
        if ((req as AuthRequest & { vendor?: unknown }).vendor && !req.user) {
            return next();
        }

        return guard(req, res, next);
    };
};
