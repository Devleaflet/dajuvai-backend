import { PermissionAction } from "../entities/permission.enum";

export const getPermissionString = (level: number):PermissionAction => {
    switch (level) {
        case 1:
            return PermissionAction.VIEW;
        case 2:
            return PermissionAction.CREATE_EDIT;
        case 3:
            return PermissionAction.DELTE;
        default:
            return PermissionAction.UNKNOWN;
    }
};