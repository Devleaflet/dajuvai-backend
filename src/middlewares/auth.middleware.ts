import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, UserRole } from '../entities/user.entity';
import AppDataSource from '../config/db.config';
import { string, ZodError, ZodSchema } from 'zod';
import { Vendor } from '../entities/vendor.entity';
import { APIError } from '../utils/ApiError.utils';
import { ProductService } from '../service/product.service';
import { Product } from '../entities/product.entity';
import { parse } from 'path';
import { OrderItem } from '../entities/orderItems.entity';
import { Review } from '../entities/reviews.entity';


/**
 * Extends Express Request object with `user?: User`.
 * Used for authenticated routes requiring user context.
 */
export interface AuthRequest<P = {}, ResBody = {}, ReqBody = {}, ReqQuery = {}> extends Request<P, ResBody, ReqBody, ReqQuery> {
    user?: User;
}


/**
 * Extends Express Request object with `vendor?: Vendor`.
 * Used for authenticated routes requiring vendor context.
 */
export interface VendorAuthRequest<P = {}, ResBody = {}, ReqBody = {}, ReqQuery = {}> extends Request<P, ResBody, ReqBody, ReqQuery> {
    vendor?: Vendor;
}


/**
 * Extends Express Request object with both `user?` and `vendor?`.
 * Used when either type of authentication is supported.
 */
export interface CombinedAuthRequest<P = {}, ResBody = {}, ReqBody = {}, ReqQuery = {}> extends Request<P, ResBody, ReqBody, ReqQuery> {
    user?: User;
    vendor?: Vendor;
}



const userDB = AppDataSource.getRepository(User);
const vendorDB = AppDataSource.getRepository(Vendor);
const productDB = AppDataSource.getRepository(Product);



/**
 * Authorizes access to vendors and admins only.
 * Checks if `req.vendor` or `req.user.role === ADMIN`.
 * @route Middleware
 * @access Vendor | Admin
 */

export const restrictToVendorOrAdmin = async (
    req: VendorAuthRequest & AuthRequest,
    res: Response,
    next: NextFunction
) => {
    const user = req.user;
    const vendor = req.vendor;

    if (!user && !vendor) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
    }

    if (user?.role === UserRole.ADMIN || vendor) {
        return next();
    }

    res.status(403).json({ success: false, message: 'Not authorized: Admin or Vendor only' });
};



/**
 * Middleware that authenticates both vendors and users using JWT tokens.
 * Token can be in cookies (`vendorToken` or `token`) or Authorization header.
 * @route Middleware
 * @access Admin | Vendor
 */
export const combinedAuthMiddleware = async (
    req: CombinedAuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const token = req.cookies.vendorToken || req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        res.status(401).json({ success: false, message: 'Authentication token is missing' });
        return;
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret') as { id: number; email: string; businessName?: string; role?: string;[key: string]: any };

        console.log('Decoded token:', decoded);

        // Check if token is for a vendor (has businessName)
        if (decoded.businessName) {
            const vendor = await vendorDB.findOneBy({ id: decoded.id });
            if (!vendor) {
                res.status(401).json({ success: false, message: 'Invalid token: vendor not found' });
                return;
            }
            req.vendor = vendor;
            next();
            return;
        }

        // Check if token is for a user/admin (has role)
        if (decoded.role) {
            const user = await userDB.findOneBy({ id: decoded.id });
            if (!user) {
                res.status(401).json({ success: false, message: 'Invalid token: user not found' });
                return;
            }
            req.user = user;
            next();
            return;
        }

        res.status(401).json({ success: false, message: 'Invalid token: missing role or businessName' });
        return;
    } catch (err) {
        res.status(401).json({ success: false, message: 'Invalid or expired token' });
        return;
    }
};


/**
 * Authenticates a vendor by verifying the vendorToken.
 * Attaches vendor to `req.vendor` if valid.
 * @route Middleware
 * @access Vendor
 * @throws APIError - If token is missing or invalid.
 */
export const vendorAuthMiddleware = async (req: VendorAuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const vendorToken = req.cookies.vendorToken || req.headers.authorization?.split(' ')[1];

    console.log("request reached vendor auth middleware")
    if (!vendorToken) {
        throw new APIError(401, 'Authentication token is missing');
    }

    try {
        const decoded = jwt.verify(vendorToken, process.env.JWT_SECRET || 'your_jwt_secret') as {
            id: number;
            email: string;
            businessName: string;
        };

        const vendor = await vendorDB.findOneBy({ id: decoded.id });
        if (!vendor) {
            throw new APIError(401, 'Vendor not found');
        }
        console.log("Vendor details: ", vendor)
        req.vendor = vendor;
        next();
    } catch (error) {
        throw new APIError(401, 'Invalid or expired token');
    }
};



/**
 * Authenticates a user (admin or customer) by verifying the JWT token.
 * Attaches user to `req.user` if valid.
 * @route Middleware
 * @access Admin | Customer
 */

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

        if (!token) {
            res.status(401).json({ success: false, message: 'No token provided. Please log in.' });
            return;
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret') as {
            id: number;
            email: string;
            role: string
        };

        const user = await userDB.findOneBy({ id: decoded.id });

        if (!user.isVerified) {
            throw new APIError(401, "Invalid token")
        }

        if (!user) {
            res.status(401).json({ success: false, message: 'User not found. Please log in again.' });
            return;
        }
        console.log("admin detail:", user)
        req.user = user;
        next();
    } catch (error) {
        console.error('Authentication error:', error);
        res.status(401).json({ success: false, message: 'Invalid or expired token. Please log in.' });
    }
};

/**
 * Authorizes the currently logged-in user to access their own account.
 * @param req - Contains target user ID in req.params
 * @route Middleware
 * @access Account Owner
 */
export const isAccountOwner = (req: AuthRequest<{ id: string }>, res: Response, next: NextFunction): void => {
    const targetUserId = parseInt(req.params.id, 10);

    if (isNaN(targetUserId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID in URL' });
        return;
    }

    if (!req.user) {
        res.status(401).json({ success: false, message: 'Authentication required' });
        return;
    }

    if (req.user.id !== targetUserId) {
        res.status(403).json({ success: false, message: 'You can only access your own account' });
        return;
    }

    next();
};

export const isAccountOwnerOrAdmin = (req: AuthRequest<{ id: string }>, res: Response, next: NextFunction): void => {
    const loggedInUser = req.user;

    if (!loggedInUser) {
        res.status(401).json({ success: true, msg: "Authentication required" })
        return;
    }

    const targetUserId = parseInt(req.params.id, 10);
    if (isNaN(targetUserId)) {
        res.status(400).json({ success: false, message: 'Invalid user ID parameter' });
        return;
    }

    const isOwner = loggedInUser.id == targetUserId;
    const isAdmin = loggedInUser.role == UserRole.ADMIN;

    if (isOwner || isAdmin) {
        next();
    } else {
        res.status(403).json({ success: false, message: "Not authorized to perform this action" })
    }
}


/**
 * Authorizes access if the vendor/user is the owner of the account or if the user is an admin.
 * @param req - Contains target vendor/user ID in req.params
 * @route Middleware
 * @access Vendor Owner | Admin
 */
export const isVendorAccountOwnerOrAdminOrStaff = async (
    req: CombinedAuthRequest<{ id: string }>,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const loggedInUser = req.vendor || req.user;

    if (!loggedInUser) {
        console.log('No logged-in user or vendor found:', { user: req.user, vendor: req.vendor });
        res.status(401).json({ success: false, msg: "Authentication required" });
        return;
    }

    const productId = parseInt(req.params.id, 10);
    if (isNaN(productId)) {
        console.log('Invalid product ID:', req.params.id);
        res.status(400).json({ success: false, message: 'Invalid product ID parameter' });
        return;
    }

    const isAdminOrStaff = req.user?.role === UserRole.ADMIN || req.user?.role === UserRole.STAFF;

    let isVendorProductOwner = false;

    if (req.vendor) {
        try {
            const product = await productDB.findOne({
                where: {
                    id: productId,
                    vendorId: req.vendor.id,
                },
            });

            console.log(`Product details : ${product}`)

            if (product) {
                isVendorProductOwner = true;
                console.log('Vendor owns product:', { productId, vendorId: req.vendor.id });
            } else {
                console.log('Product not found or not owned by vendor:', { productId, vendorId: req.vendor.id });
            }
        } catch (error) {
            console.error("Error fetching product for ownership check:", error);
            res.status(500).json({ success: false, message: "Internal server error in middleware" });
            return;
        }
    } else {
        console.log('No vendor in request, checking user role:', { userRole: req.user?.role });
    }

    if (isVendorProductOwner || isAdminOrStaff) {
        console.log('Authorization granted:', { isVendorProductOwner, isAdminOrStaff });
        next();
    } else {
        console.log('Authorization denied:', { isVendorProductOwner, isAdminOrStaff });
        res.status(403).json({ success: false, message: "Not authorized to perform this action" });
    }
};



/**
 * Checks if the authenticated user has admin privileges.
 * @route Middleware
 * @access Admin
 */

export const isAdmin = (req: AuthRequest, res: Response, next: NextFunction) => {
    console.log("req reached is admin middleware")
    if (req.user && req.user.role === UserRole.ADMIN) {
        console.log(req.user);
        next();
    } else {
        res.status(403).json({ success: false, message: 'Admin access required' });
    }
};


/**
 * Checks if the authenticated user is a vendor.
 * @route Middleware
 * @access Vendor
 */

export const isVendor = async (req: VendorAuthRequest, res: Response, next: NextFunction) => {
    if (req.vendor) {
        console.log(req.vendor)
        next();
    } else {
        res.status(403).json({ success: false, message: 'Vendor access required' });
    }
};

/**
 * Check if the logged in user is eiher staff or admin 
 */
export const isAdminOrStaff = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user && (req.user.role === UserRole.ADMIN || req.user.role === UserRole.STAFF)) {
        return next();
    } else {
        res.status(403).json({ success: false, message: 'Staff or admin access required' });
    }
}

// export const isAdminOrStaffOrAccountOwner = async(req: CombinedAuthRequest, res: Response, next: NextFunction) => {
//     if(req.user){
//         if(req.user.role === UserRole.ADMIN || req.user.role === UserRole.STAFF){
//             return next();
//         } else{
//             const userId = req.user.id;

//             // const id = req.params.id;
//         }
//     }
// }

export const requireAdminStaffOrVendor = async (req: CombinedAuthRequest, res: Response, next: NextFunction) => {
    if ((req.user && (req.user.role == UserRole.ADMIN || req.user.role == UserRole.STAFF)) || req.vendor) {
        next()
    } else {
        res.status(403).json({ success: false, message: 'Either admin , staff or vendor access required' });
    }
}

export const requireUserRole = async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (req.user) {
        if (req.user.role !== UserRole.USER) {
            console.log("this is error")
            throw new APIError(400, "Only customer accounts can perform this action. .")
        }
        console.log("error passed")
        next()
    }
    // if (req.user && req.user.role == UserRole.USER) {
    //     console.log(req.user.role)
    //     console.log(UserRole.USER)
    //     next();
    // }
    // res.status(403).json({
    //     success: false,
    //     message: "Only customer accounts can perform this action. If you are an admin or vendor, please create a customer account first."
    // })
}
/**
 * Authorizes both admin and vendor roles.
 * @route Middleware
 * @access Admin | Vendor
 */

export const isAdminOrVendor = async (
    req: CombinedAuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        if (req.user?.role === UserRole.ADMIN) {
            next();
            return;
        }

        if (req.vendor) {
            next();
            return;
        }

        res.status(403).json({
            success: false,
            message: "Forbidden: Admin or Vendor access required",
        });
    } catch (err) {
        console.error("Middleware error in isAdminOrVendor:", err);
        res.status(500).json({
            success: false,
            message: "Internal server error",
        });
    }
};




/**
 * Validates request body/query/params using Zod schema.
 * Automatically formats validation errors and passes them to next middleware.
 * @param schema - Zod schema to validate against
 * @param property - Target request property ('body' | 'query' | 'params'), defaults to 'body'
 * @route Middleware
 * @access Public (used for input validation)
 */
export const validateZod = (
    schema: ZodSchema,
    property: 'body' | 'query' | 'params' = 'body'
) => {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            const parsed = await schema.parseAsync(req[property]);
            req[property] = parsed;
            next();
        } catch (error) {
            console.error('validateZod middleware caught error:', error);
            if (error instanceof ZodError) {
                const formatted = error.flatten();
                return next(
                    new APIError(400, 'Validation error: ' + JSON.stringify(formatted.fieldErrors))
                );
            }
            next(new APIError(500, 'Unexpected validation middleware error'));
        }
    };
};

export const canReviewProduct = async (req: AuthRequest<{}, {}, { productId: string }, {}>, res: Response, next: NextFunction): Promise<void> => {
    try {
        const userId = req.user?.id;

        const productId = parseInt(req.body.productId, 10)

        if (!userId) {
            res.status(401).json({ success: false, message: "Authentication required" });
            return;
        }

        if (isNaN(productId)) {
            res.status(400).json({ success: false, message: "Invalid product ID" });
            return;
        }

        const orderItemRepo = AppDataSource.getRepository(OrderItem);

        // check if user has DELIVERED order containing this product
        const purchasedItem = await orderItemRepo
            .createQueryBuilder("orderItem")
            .innerJoinAndSelect("orderItem.order", "order")
            .where("order.orderedById = :userId", { userId })
            .andWhere("order.status = :status", { status: "CONFIRMED" })
            .andWhere("orderItem.productId = :productId", { productId })
            .getOne()

        if (!purchasedItem) {
            res.status(403).json({
                success: false,
                message: "You can only review products you have purchased."
            });
            return;
        }

        // check if user has already reviewed this  product
        const reviewRepo = AppDataSource.getRepository(Review);

        const existingReview = await reviewRepo.findOne({
            where: { userId, productId },
        });

        if (existingReview) {
            res.status(400).json({
                success: false,
                message: "You have already reviewed this product",
            });
            return;
        }

        next();

    } catch (error) {
        console.log("Can review product middleware error: ", error)
        res.status(500).json({ success: false, message: "Internal server error" });
    }
}

// Review author (user) → can delete their own review.
// Product vendor → can delete any review on their product.
export const canDeleteReview = async (req: CombinedAuthRequest<{ id: string }>, res: Response, next: NextFunction): Promise<void> => {
    try {
        const reviewId = parseInt(req.params.id, 10);
        if (isNaN(reviewId)) {
            res.status(400).json({ success: false, message: "Invalid review ID" });
            return;
        }

        const reviewRepo = AppDataSource.getRepository(Review);
        const review = await reviewRepo.findOne({
            where: { id: reviewId },
            relations: ["product"],
        });

        if (!review) {
            res.status(404).json({ success: false, message: "Review not found" });
            return;
        }

        const userId = req.user?.id;
        const vendorId = req.vendor?.id;

        const isReviewOwner = userId === review.userId;
        const isProductOwner = vendorId !== undefined && review.product.vendorId === vendorId;

        if (!isReviewOwner && !isProductOwner) {
            res.status(403).json({
                success: false,
                message: "You are not authorized to delete this review",
            });
            return;
        }

        next();
    } catch (err) {
        console.error("Delete review middleware error:", err);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
};
