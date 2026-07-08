import { Request, Response, NextFunction } from "express";
import jwt, {
  JsonWebTokenError,
  TokenExpiredError as JwtTokenExpiredError,
} from "jsonwebtoken";
import { User, UserRole } from "../entities/user.entity";
import AppDataSource from "../config/db.config";
import { ZodError, ZodSchema } from "zod";
import { Vendor } from "../entities/vendor.entity";
import { Product } from "../entities/product.entity";
import { OrderItem } from "../entities/orderItems.entity";
import { Review } from "../entities/reviews.entity";
import config from "../config/env.config";
import { Rider } from "../entities/rider.entity";
import {
  AuthError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  TokenExpiredError,
  ValidationError,
} from "../errors";

/**
 * Extends Express Request object with `user?: User`.
 * Used for authenticated routes requiring user context.
 */
export interface AuthRequest<P = {}, ResBody = {}, ReqBody = {}, ReqQuery = {}>
  extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: User;
}

/**
 * Extends Express Request object with `vendor?: Vendor`.
 * Used for authenticated routes requiring vendor context.
 */
export interface VendorAuthRequest<
  P = {},
  ResBody = {},
  ReqBody = {},
  ReqQuery = {},
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  vendor?: Vendor;
}

/**
 * Extends Express Request object with both `user?` and `vendor?`.
 * Used when either type of authentication is supported.
 */
export interface CombinedAuthRequest<
  P = {},
  ResBody = {},
  ReqBody = {},
  ReqQuery = {},
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: User;
  vendor?: Vendor;
}

/**
 * Extends Express Request object with `user?: User` and `rider?: Rider`.
 * Used for authenticated routes requiring rider context.
 */
export interface RiderAuthRequest<
  P = {},
  ResBody = {},
  ReqBody = {},
  ReqQuery = {},
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: User;
  rider?: Rider;
}

const userDB = AppDataSource.getRepository(User);
const vendorDB = AppDataSource.getRepository(Vendor);
const productDB = AppDataSource.getRepository(Product);
const riderDB = AppDataSource.getRepository(Rider);

/**
 * Authorizes access to vendors and admins only.
 * @route Middleware
 * @access Vendor | Admin
 */
export const restrictToVendorOrAdmin = async (
  req: VendorAuthRequest & AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const user = req.user;
  const vendor = req.vendor;

  if (!user && !vendor) {
    return next(new AuthError("Authentication required"));
  }

  if (user?.role === UserRole.ADMIN || vendor) {
    return next();
  }

  return next(new ForbiddenError("Not authorized: Admin or Vendor only"));
};

/**
 * Authenticates both vendors and users using JWT tokens.
 * Token can be in cookies (vendorToken or token) or Authorization header.
 * @route Middleware
 * @access Admin | Vendor
 */
export const combinedAuthMiddleware = async (
  req: CombinedAuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token =
    req.cookies.vendorToken || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return next(new AuthError("Authentication token is missing"));
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as {
      id: number;
      email: string;
      businessName?: string;
      role?: string;
      [key: string]: any;
    };

    if (decoded.businessName) {
      const vendor = await vendorDB.findOneBy({ id: decoded.id });
      if (!vendor) {
        return next(new AuthError("Invalid token: vendor not found"));
      }
      req.vendor = vendor;
      return next();
    }

    if (decoded.role) {
      const user = await userDB.findOneBy({ id: decoded.id });
      if (!user) {
        return next(new AuthError("Invalid token: user not found"));
      }
      req.user = user;
      return next();
    }

    return next(new AuthError("Invalid token: missing role or businessName"));
  } catch (err) {
    if (
      err instanceof JsonWebTokenError &&
      err.message === "invalid signature"
    ) {
      return next(
        new AuthError("Vendor session not found. Please log in as a vendor."),
      );
    }
    if (err instanceof JwtTokenExpiredError) {
      return next(
        new TokenExpiredError("Token has expired — please log in again"),
      );
    }
    if (err instanceof JsonWebTokenError) {
      return next(new AuthError("Invalid or expired token"));
    }
    return next(err);
  }
};

/**
 * Authenticates a vendor by verifying the vendorToken.
 * Attaches vendor to `req.vendor` if valid.
 * @route Middleware
 * @access Vendor
 */
export const vendorAuthMiddleware = async (
  req: VendorAuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const vendorToken =
    req.cookies.vendorToken || req.headers.authorization?.split(" ")[1];

  if (!vendorToken) {
    return next(new AuthError("Authentication token is missing"));
  }

  try {
    const decoded = jwt.verify(vendorToken, config.JWT_SECRET) as {
      id: number;
      email: string;
      businessName?: string;
      role?: string;
    };

    if (!decoded.businessName) {
      return next(new AuthError("Invalid token: not a vendor session"));
    }

    const vendor = await vendorDB.findOneBy({ id: decoded.id });
    if (!vendor) {
      return next(new AuthError("Vendor not found"));
    }
    req.vendor = vendor;
    return next();
  } catch (err) {
    if (err instanceof JwtTokenExpiredError) {
      return next(
        new TokenExpiredError("Token has expired — please log in again"),
      );
    }
    if (err instanceof JsonWebTokenError) {
      return next(new AuthError("Invalid or expired token"));
    }
    return next(err);
  }
};

/**
 * Authenticates a user (admin or customer) by verifying the JWT token.
 * Attaches user to `req.user` if valid.
 * @route Middleware
 * @access Admin | Customer
 */
export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const token = req.cookies.token || req.headers.authorization?.split(" ")[1];

  if (!token) {
    return next(new AuthError("No token provided. Please log in."));
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as {
      id: number;
      email: string;
      role?: string;
      businessName?: string;
    };

    // A vendor token verifies fine against the same secret but carries `businessName`
    // instead of `role` — reject it here so a stray vendor token can never be mistaken
    // for a user/admin by numeric id collision (vendor id 5 vs user id 5 are unrelated).
    if (!decoded.role || decoded.businessName) {
      return next(new AuthError("Invalid token: not a user session"));
    }

    const user = await userDB.findOneBy({ id: decoded.id });

    if (!user) {
      return next(new AuthError("User not found. Please log in again."));
    }

    if (!user.isVerified) {
      return next(new AuthError("Account is not verified."));
    }

    req.user = user;
    return next();
  } catch (err) {
    if (err instanceof JwtTokenExpiredError) {
      return next(
        new TokenExpiredError("Token has expired — please log in again"),
      );
    }
    if (err instanceof JsonWebTokenError) {
      return next(new AuthError("Invalid or expired token. Please log in."));
    }
    return next(err);
  }
};

/**
 * Authorizes the currently logged-in user to access their own account.
 * @route Middleware
 * @access Account Owner
 */
export const isAccountOwner = (
  req: AuthRequest<{ id: string }>,
  res: Response,
  next: NextFunction,
): void => {
  const targetUserId = parseInt(req.params.id, 10);

  if (isNaN(targetUserId)) {
    return next(new BadRequestError("Invalid user ID in URL"));
  }

  if (!req.user) {
    return next(new AuthError("Authentication required"));
  }

  if (req.user.id !== targetUserId) {
    return next(new ForbiddenError("You can only access your own account"));
  }

  next();
};

export const isAccountOwnerOrAdmin = (
  req: AuthRequest<{ id: string }>,
  res: Response,
  next: NextFunction,
): void => {
  const loggedInUser = req.user;

  if (!loggedInUser) {
    return next(new AuthError("Authentication required"));
  }

  const targetUserId = parseInt(req.params.id, 10);
  if (isNaN(targetUserId)) {
    return next(new BadRequestError("Invalid user ID parameter"));
  }

  const isOwner = loggedInUser.id == targetUserId;
  const isAdmin = loggedInUser.role == UserRole.ADMIN;

  if (isOwner || isAdmin) {
    return next();
  }

  return next(new ForbiddenError("Not authorized to perform this action"));
};

/**
 * Authorizes if the vendor/user is the account owner or an admin/staff.
 * @route Middleware
 * @access Vendor Owner | Admin
 */
export const isVendorAccountOwnerOrAdminOrStaff = async (
  req: CombinedAuthRequest<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const loggedInUser = req.vendor || req.user;

  if (!loggedInUser) {
    return next(new AuthError("Authentication required"));
  }

  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId)) {
    return next(new BadRequestError("Invalid product ID parameter"));
  }

  const isAdminOrStaff =
    req.user?.role === UserRole.ADMIN || req.user?.role === UserRole.STAFF;

  let isVendorProductOwner = false;

  if (req.vendor) {
    try {
      const product = await productDB.findOne({
        where: { id: productId, vendorId: req.vendor.id },
      });
      if (product) isVendorProductOwner = true;
    } catch (error) {
      return next(error);
    }
  }

  if (isVendorProductOwner || isAdminOrStaff) {
    return next();
  }

  return next(new ForbiddenError("Not authorized to perform this action"));
};

/**
 * Checks if the authenticated user has admin privileges.
 * @route Middleware
 * @access Admin
 */
export const isAdmin = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (req.user && req.user.role === UserRole.ADMIN) {
    return next();
  }
  return next(new ForbiddenError("Admin access required"));
};

/**
 * Checks if the authenticated user is a vendor.
 * @route Middleware
 * @access Vendor
 */
export const isVendor = async (
  req: VendorAuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (req.vendor) {
    return next();
  }
  return next(new ForbiddenError("Vendor access required"));
};

/**
 * Checks if the logged-in user is either staff or admin.
 */
export const isAdminOrStaff = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (
    req.user &&
    (req.user.role === UserRole.ADMIN || req.user.role === UserRole.STAFF)
  ) {
    return next();
  }
  return next(new ForbiddenError("Staff or admin access required"));
};

/**
 * Checks if the logged-in user is a rider.
 */
export const isRider = async (
  req: RiderAuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (req.user && req.user.role === UserRole.RIDER) {
    const rider = await riderDB.findOne({ where: { userId: req.user.id } });
    if (!rider) {
      return next(
        new ForbiddenError("No rider profile linked to this account"),
      );
    }
    req.rider = rider;
    return next();
  }
  return next(new ForbiddenError("Rider access required"));
};

export const requireAdminStaffOrVendor = async (
  req: CombinedAuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (
    (req.user &&
      (req.user.role == UserRole.ADMIN || req.user.role == UserRole.STAFF)) ||
    req.vendor
  ) {
    return next();
  }
  return next(new ForbiddenError("Admin, Staff or Vendor access required"));
};

export const requireUserRole = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  if (req.user) {
    if (req.user.role !== UserRole.USER) {
      return next(
        new ConflictError("Only customer accounts can perform this action."),
      );
    }
    return next();
  }
};

/**
 * Authorizes both admin and vendor roles.
 * @route Middleware
 * @access Admin | Vendor
 */
export const isAdminOrVendor = async (
  req: CombinedAuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (req.user?.role === UserRole.ADMIN || req.vendor) {
    return next();
  }
  return next(new ForbiddenError("Admin or Vendor access required"));
};

/**
 * Validates request body/query/params using a Zod schema.
 * Forwards a ValidationError to the global error handler on failure.
 * @param schema - Zod schema to validate against
 * @param property - Target request property ('body' | 'query' | 'params'), defaults to 'body'
 */
export const validateZod = (
  schema: ZodSchema,
  property: "body" | "query" | "params" = "body",
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      req[property] = await schema.parseAsync(req[property]);
      return next();
    } catch (error) {
      if (error instanceof ZodError) {
        const fields = error.errors.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        }));
        return next(new ValidationError("Validation failed", fields));
      }
      return next(error);
    }
  };
};

export const canReviewProduct = async (
  req: AuthRequest<{}, {}, { productId: string }, {}>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const userId = req.user?.id;
  const productId = parseInt(req.body.productId, 10);

  if (!userId) {
    return next(new AuthError("Authentication required"));
  }

  if (isNaN(productId)) {
    return next(new BadRequestError("Invalid product ID"));
  }

  try {
    const orderItemRepo = AppDataSource.getRepository(OrderItem);

    const purchasedItem = await orderItemRepo
      .createQueryBuilder("orderItem")
      .innerJoinAndSelect("orderItem.order", "order")
      .where("order.orderedById = :userId", { userId })
      .andWhere("order.status = :status", { status: "CONFIRMED" })
      .andWhere("orderItem.productId = :productId", { productId })
      .getOne();

    if (!purchasedItem) {
      return next(
        new ForbiddenError("You can only review products you have purchased."),
      );
    }

    const reviewRepo = AppDataSource.getRepository(Review);
    const existingReview = await reviewRepo.findOne({
      where: { userId, productId },
    });

    if (existingReview) {
      return next(new ConflictError("You have already reviewed this product"));
    }

    return next();
  } catch (error) {
    return next(error);
  }
};

// Review author → can delete their own review.
// Product vendor → can delete any review on their product.
export const canDeleteReview = async (
  req: CombinedAuthRequest<{ id: string }>,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const reviewId = parseInt(req.params.id, 10);
  if (isNaN(reviewId)) {
    return next(new BadRequestError("Invalid review ID"));
  }

  try {
    const reviewRepo = AppDataSource.getRepository(Review);
    const review = await reviewRepo.findOne({
      where: { id: reviewId },
      relations: ["product"],
    });

    if (!review) {
      return next(new NotFoundError("Review"));
    }

    const userId = req.user?.id;
    const vendorId = req.vendor?.id;

    const isReviewOwner = userId === review.userId;
    const isProductOwner =
      vendorId !== undefined && review.product.vendorId === vendorId;

    if (!isReviewOwner && !isProductOwner) {
      return next(
        new ForbiddenError("You are not authorized to delete this review"),
      );
    }

    return next();
  } catch (err) {
    return next(err);
  }
};
