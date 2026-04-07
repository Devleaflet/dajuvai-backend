import { Request, Response, NextFunction, RequestHandler } from "express";

type AsyncController<
    P = any,
    ResBody = any,
    ReqBody = any,
    ReqQuery = any,
> = (
    req: Request<P, ResBody, ReqBody, ReqQuery>,
    res: Response,
    next: NextFunction,
) => Promise<void>;

/**
 * Wraps an async controller so that any thrown error or rejected promise
 * is forwarded to Express's error pipeline via next(err).
 *
 * With globalErrorHandler in place, controllers never need try-catch blocks.
 * Just throw (or let the service throw) and it gets handled centrally.
 */
export const asyncHandler = <
    P = any,
    ResBody = any,
    ReqBody = any,
    ReqQuery = any,
>(
    fn: AsyncController<P, ResBody, ReqBody, ReqQuery>,
): RequestHandler<P, ResBody, ReqBody, ReqQuery> => {
    return (req, res, next) => {
        Promise.resolve(fn(req as any, res, next)).catch(next);
    };
};
