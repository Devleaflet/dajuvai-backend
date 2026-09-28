import { Request, Response, NextFunction } from "express";
import jwt, {
  JsonWebTokenError,
  TokenExpiredError as JwtTokenExpiredError,
} from "jsonwebtoken";
import { User, UserRole } from "../entities/user.entity";
import AppDataSource from "../config/db.config";
import {
  isIssuedBeforeCutoff,
  isTokenRevoked,
} from "../service/token-revocation.service";
import { Vendor } from "../entities/vendor.entity";
import { Product } from "../entities/product.entity";
import { OrderItem } from "../entities/orderItems.entity";
import { OrderStatus } from "../entities/order.entity";
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
} from "../errors";

/**
 * Extends Express Request object with `user?: User`.
 * Used for authenticated routes requiring user context.
 */
export interface AuthRequest<P = {}, ResBody = {}, ReqBody = {}, ReqQuery = {}>
  extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: User;
  /**
   * The claims of the token this request arrived with.
   *
   * Carried so a handler can revoke *the token it was called with* — logout
   * needs the `jti`, and nothing else in the request can tell it apart from
   * any other session the same account holds.
   */
  auth?: { jti?: string; iat?: number; exp?: number };
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
 *
 * Every route using this guard addresses one vendor row by id, so a vendor is
 * let through only for their own record. Without that comparison any vendor
 * token could edit any other vendor, payout details included.
 *
 * @route Middleware
 * @access Vendor (self) | Admin
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

  if (user?.role === UserRole.ADMIN) {
    return next();
  }

  if (vendor) {
    // `:vendorId` on the payment-option route, `:id` on the two update routes.
    const params = (req.params ?? {}) as { vendorId?: string; id?: string };
    const targetId = Number(params.vendorId ?? params.id);

    if (!Number.isInteger(targetId) || targetId !== vendor.id) {
      return next(
        new ForbiddenError("Not authorized: vendors may only change their own account"),
      );
    }

    return next();
  }

  return next(new ForbiddenError("Not authorized: Admin or Vendor only"));
};

/**
 * Authenticates both vendors and users using JWT tokens.
 * Token can be in cookies (vendorToken or token) or Authorization header.
 * @route Middleware
 * @access Admin | Staff | Vendor | User
 */
export const combinedAuthMiddleware = async (
  req: CombinedAuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const bearerToken = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.split(" ")[1]
    : undefined;
  const token = bearerToken || req.cookies.vendorToken || req.cookies.token;

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

    const accountId = Number(decoded.id);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      return next(new AuthError("Invalid token: missing account id"));
    }

    // One door, two subject types — both get the same revocation rules.
    if (await isTokenRevoked(decoded.jti as string | undefined)) {
      return next(new AuthError("This session has been signed out. Please log in again."));
    }

    if (decoded.businessName) {
      const vendor = await vendorDB.findOneBy({ id: accountId });
      if (!vendor) {
        return next(new AuthError("Invalid token: vendor not found"));
      }
      if (isIssuedBeforeCutoff(decoded.iat as number | undefined, vendor.tokensValidFrom)) {
        return next(new AuthError("Your password changed. Please log in again."));
      }
      req.vendor = vendor;
      return next();
    }

    if (decoded.role) {
      const user = await userDB.findOneBy({ id: accountId });
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
    // The token the client sent explicitly wins over an ambient cookie, as in
    // combinedAuthMiddleware: a leftover cookie from another session must not
    // decide who this request is.
    req.headers.authorization?.split(" ")[1] || req.cookies.vendorToken;

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

    const vendorClaims = decoded as { jti?: string; iat?: number };

    // Revocation applies to vendors too: a vendor logout and a vendor password
    // reset must end the session they were issued for.
    if (await isTokenRevoked(vendorClaims.jti)) {
      return next(new AuthError("This session has been signed out. Please log in again."));
    }

    const vendor = await vendorDB.findOneBy({ id: decoded.id });
    if (!vendor) {
      return next(new AuthError("Vendor not found"));
    }

    if (isIssuedBeforeCutoff(vendorClaims.iat, vendor.tokensValidFrom)) {
      return next(new AuthError("Your password changed. Please log in again."));
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
 * Routes an account inside its deletion grace period may still reach.
 *
 * Deliberately a short, explicit list rather than a flag a route can set:
 * "which endpoints survive deletion" is a security decision, and it belongs in
 * one place that can be read in ten seconds. Matched against the mounted path,
 * so `/api/auth/me/cancel-deletion` and `/api/auth/logout` are reachable while
 * everything else is refused.
 */
const DELETION_GRACE_ALLOWLIST: ReadonlyArray<{ method: string; path: RegExp }> = [
  // Get out of the grace period.
  { method: "POST", path: /^\/me\/cancel-deletion$/ },
  // Read your own account, so the screen offering that button can render.
  { method: "GET", path: /^\/me$/ },
  // Leave cleanly.
  { method: "POST", path: /^\/logout$/ },
];

function allowsPendingDeletion(req: Request): boolean {
  // `req.path` is relative to the router this middleware runs in, which is what
  // the patterns above are written against.
  return DELETION_GRACE_ALLOWLIST.some(
    (entry) => entry.method === req.method && entry.path.test(req.path),
  );
}

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
  // Explicit bearer first, then the cookie — see vendorAuthMiddleware.
  const token = req.headers.authorization?.split(" ")[1] || req.cookies.token;

  if (!token) {
    return next(new AuthError("No token provided. Please log in."));
  }

  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as {
      id: number;
      email: string;
      role?: string;
      businessName?: string;
      jti?: string;
      iat?: number;
      exp?: number;
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

    /**
     * A token can verify and still be withdrawn.
     *
     * `jti` is the single-token case — a logout. `tokensValidFrom` is the bulk
     * case — a password change or reset invalidates every token issued before
     * it, including ones we have never seen. Neither applies to tokens signed
     * before this shipped: they carry no `jti`, and an account that has never
     * revoked anything has `tokensValidFrom` null.
     */
    if (await isTokenRevoked(decoded.jti)) {
      return next(new AuthError("This session has been signed out. Please log in again."));
    }

    if (isIssuedBeforeCutoff(decoded.iat, user.tokensValidFrom)) {
      return next(
        new AuthError("Your password changed. Please log in again."),
      );
    }

    // Accounts scheduled for deletion (grace period) or already finalized
    // cannot use their old sessions. Reactivation happens via the login
    // flows (email/password reactivation endpoint or Google sign-in).
    if (user.deletionFinalizedAt) {
      return next(new AuthError("This account no longer exists."));
    }
    /**
     * An account inside its deletion grace period keeps a usable session for
     * the few routes that exist to get out of it.
     *
     * Blanket rejection was the bug: the app offers "cancel deletion" on the
     * account screen, and the screen could not be loaded, so the only way back
     * was to guess that signing out and in again reactivates. Everything else
     * stays refused — no browsing, no ordering — which is the point of the
     * grace period.
     */
    if (user.deletionScheduledFor && !allowsPendingDeletion(req)) {
      return next(
        new AuthError(
          "This account is scheduled for deletion. Cancel the deletion to keep using it.",
        ),
      );
    }

    if (!user.isVerified) {
      return next(new AuthError("Account is not verified."));
    }

    req.user = user;
    req.auth = { jti: decoded.jti, iat: decoded.iat, exp: decoded.exp };
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
  if (
    req.user?.role === UserRole.ADMIN ||
    req.user?.role === UserRole.STAFF ||
    req.vendor
  ) {
    return next();
  }
  return next(new ForbiddenError("Admin or Vendor access required"));
};

/**
 * @deprecated Import from "./validation.middleware" instead. Generic request
 * validation doesn't belong in an authentication middleware file — kept
 * here only so the ~20 existing route files that import validateZod from
 * this module don't all need touching in the same change. New code should
 * import directly from validation.middleware.ts.
 */
export { validateZod } from "./validation.middleware";

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

    // DELIVERED, not CONFIRMED. The old check was backwards in both
    // directions: CONFIRMED is the status an order holds *before* it ships, so
    // it let a shopper review something that had not reached them yet, and
    // because status moves on as the order progresses, an order that actually
    // arrived no longer matched at all — the one person qualified to review was
    // the one person refused. A review is a report on a product someone has,
    // so the order has to have been delivered.
    const purchasedItem = await orderItemRepo
      .createQueryBuilder("orderItem")
      .innerJoinAndSelect("orderItem.order", "order")
      .where("order.orderedById = :userId", { userId })
      .andWhere("order.status = :status", { status: OrderStatus.DELIVERED })
      .andWhere("orderItem.productId = :productId", { productId })
      .getOne();

    if (!purchasedItem) {
      return next(
        new ForbiddenError(
          "You can only review products from an order that has been delivered to you.",
        ),
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
